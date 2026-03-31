import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { generateAndUploadPaymentReceipt } from '@/services/paymentReceipts';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { uploadFile, deleteFile } from '@/lib/upload';
import { formatOrderNumber } from '@/lib/utils';
import { stripPendingCustomerInfoNotes } from '@/lib/orderMetadata';
import { sanitizeDisplayFileName } from '@/lib/orderFiles';
import { summarizeOrderPayments } from '@/lib/orderPayments';
import { consumeProductSupplies } from '@/lib/supplyConsumption';
import type {
  AppRole,
  Order,
  OrderPayment,
  OrderPaymentSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PublicOrderPayload,
  OrderItem,
} from '@/types/database';
import type { PaymentReceiptPayload } from '@/templates/paymentReceiptTemplate';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  produzindo_arte: 'Produzindo arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em Produção',
  finalizado: 'Finalizado',
  pronto: 'Finalizado',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  orcamento: ['pendente', 'cancelado'],
  pendente: ['produzindo_arte', 'em_producao', 'cancelado'],
  produzindo_arte: ['arte_aprovada', 'cancelado'],
  arte_aprovada: ['em_producao', 'cancelado'],
  em_producao: ['finalizado', 'cancelado'],
  finalizado: ['aguardando_retirada', 'entregue', 'cancelado'],
  pronto: ['aguardando_retirada', 'entregue', 'cancelado'],
  aguardando_retirada: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: ['pendente'],
};

const isStatusTransitionAllowed = (from: OrderStatus, to: OrderStatus) =>
  from === to || statusTransitions[from]?.includes(to);

const formatStatusLabel = (value: string) => {
  const normalized = value.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatOrderReference = (orderNumber: number | string | null | undefined) => {
  const formatted = formatOrderNumber(orderNumber);
  return `#${formatted || '00000'}`;
};

const createOrderNotification = async ({
  companyId,
  orderId,
  type,
  title,
  body,
}: {
  companyId?: string | null;
  orderId: string;
  type: string;
  title: string;
  body: string;
}) => {
  if (!companyId) return;

  await supabase.from('order_notifications').insert({
    company_id: companyId,
    order_id: orderId,
    type,
    title,
    body,
  });
};

type OrderStockDeductionItem = {
  product_id: string | null;
  product_name: string;
  quantity: number;
};

type ProductStockRow = {
  id: string;
  stock_quantity: number | string | null;
  stock_control_type?: string | null;
  track_stock?: boolean | null;
};

const usesDirectStockControl = (product: ProductStockRow) =>
  product.stock_control_type === 'simple' ||
  (!product.stock_control_type && product.track_stock !== false);

const applyDirectProductStockDeduction = async ({
  companyId,
  orderNumber,
  userId,
  items,
}: {
  companyId: string;
  orderNumber: number | string | null | undefined;
  userId?: string | null;
  items: OrderStockDeductionItem[];
}) => {
  const quantitiesByProduct = new Map<string, number>();

  items.forEach((item) => {
    if (!item.product_id) return;
    const quantity = Number(item.quantity || 0);
    if (quantity <= 0) return;
    quantitiesByProduct.set(
      item.product_id,
      (quantitiesByProduct.get(item.product_id) || 0) + quantity,
    );
  });

  const productIds = Array.from(quantitiesByProduct.keys());
  if (productIds.length === 0) return;

  const { data: productsData, error: productsError } = await supabase
    .from('products')
    .select('id, stock_quantity, stock_control_type, track_stock')
    .in('id', productIds)
    .eq('company_id', companyId);

  if (productsError) {
    throw productsError;
  }

  const directStockProducts = ((productsData || []) as ProductStockRow[]).filter(
    usesDirectStockControl,
  );

  if (directStockProducts.length === 0) return;

  await Promise.all(
    directStockProducts.map(async (product) => {
      const quantity = quantitiesByProduct.get(product.id) || 0;
      if (quantity <= 0) return;

      const nextStock = Number(product.stock_quantity || 0) - quantity;
      const { error } = await supabase
        .from('products')
        .update({ stock_quantity: nextStock })
        .eq('id', product.id)
        .eq('company_id', companyId);

      if (error) {
        throw error;
      }
    }),
  );

  await Promise.all(
    directStockProducts.map(async (product) => {
      const quantity = quantitiesByProduct.get(product.id) || 0;
      if (quantity <= 0) return;

      const { error } = await supabase.from('stock_movements').insert({
        product_id: product.id,
        movement_type: 'saida',
        quantity,
        reason: `Pedido ${formatOrderReference(orderNumber)}`,
        user_id: userId || null,
      });

      if (error) {
        throw error;
      }
    }),
  );
};

const fetchUserRole = async (userId?: string | null) => {
  let resolvedUserId = userId || null;

  if (!resolvedUserId) {
    const { data } = await supabase.auth.getUser();
    resolvedUserId = data.user.id || null;
  }

  if (!resolvedUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', resolvedUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.role ?? null;
};

type EdgeFunctionError = Error & { status?: number; payload?: unknown };

const EDGE_FUNCTIONS_ENABLED =
  import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true' || import.meta.env.PROD;

const shouldFallbackToDirectUpdate = (error: unknown) => {
  const status = (error as EdgeFunctionError | undefined)?.status;
  if (status === 404 || status === 405) {
    return true;
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('edge function request failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('cors')
  );
};

const generateFileId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const buildOrderStorageUploadPath = (
  orderId: string,
  file: File,
  prefix: 'arte' | 'foto-final',
) => {
  const fileName = file.name || prefix;
  const isSvg = file.type === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg');
  const rawExtension = isSvg ? 'svg' : (fileName.split('.').pop() || 'bin').toLowerCase();
  const extension = rawExtension.replace(/[^a-z0-9]/g, '') || 'bin';
  return `${orderId}/${prefix}-${Date.now()}-${generateFileId()}.${extension}`;
};

type ReceiptInfo = {
  number: string;
  path: string;
  publicUrl: string | null;
};

const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  financeiro: 'Financeiro',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  transferencia: 'Transferência',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const buildReceiptNumber = (orderNumber: number, paymentId: string) => {
  const suffix = paymentId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `REC-${orderNumber}-${suffix}`;
};

const buildReceiptDescription = (
  items: Array<{ product_name: string; quantity: number }>,
  orderNumber: number,
) => {
  const description = items
    .map((item) => `${item.quantity}x ${item.product_name}`)
    .filter(Boolean)
    .join(', ');
  const fallback = `Pedido ${formatOrderReference(orderNumber)}`;
  const result = description || fallback;
  return result.length > 160 ? `${result.slice(0, 157)}...` : result;
};

const buildCompanyAddress = (company?: Order['company'] | null) => {
  const parts = [company?.address, [company?.city, company?.state].filter(Boolean).join(' - ')]
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '-';
};

const getPaymentReceiptMethodLabel = (payment: OrderPayment) => {
  if (payment.source === 'customer_credit') {
    return 'Crédito do cliente';
  }

  return payment.method ? paymentMethodLabels[payment.method] || String(payment.method) : 'Não informado';
};

const fetchOrderForReceipt = async (orderId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, company_id, customer_id, customer_name, payment_method, amount_paid, customer_credit_used, customer_credit_generated, total, production_time_days_used, estimated_delivery_date, company:companies(name, document, address, city, state, logo_url, signature_image_url, signature_responsible, signature_role), customer:customers(name, document)',
    )
    .eq('id', orderId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Order;
};

const fetchOrderItemsForReceipt = async (orderId: string) => {
  const { data, error } = await supabase
    .from('order_items')
    .select('product_name, quantity')
    .eq('order_id', orderId);

  if (error || !data) {
    return [];
  }

  return data as Array<{ product_name: string; quantity: number }>;
};

const resolveReceiptSignature = async (userId?: string | null) => {
  try {
    let resolvedUserId = userId || null;
    if (!resolvedUserId) {
      const { data } = await supabase.auth.getUser();
      resolvedUserId = data.user.id || null;
    }

    if (!resolvedUserId) return null;

    const [profileResult, role] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', resolvedUserId).maybeSingle(),
      fetchUserRole(resolvedUserId),
    ]);

    const name = profileResult.data?.full_name?.trim() || null;
    const cargo = role ? roleLabels[role] : null;
    return { name, cargo };
  } catch {
    return null;
  }
};

const generateReceiptForPayment = async ({
  orderId,
  payment,
  orderData,
  createdBy,
}: {
  orderId: string;
  payment: OrderPayment;
  orderData?: Order | null;
  createdBy?: string | null;
}): Promise<ReceiptInfo | null> => {
  if (payment.status === 'pendente') return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const order = orderData || (await fetchOrderForReceipt(orderId));
  if (!order) return null;

  const [items, signature] = await Promise.all([
    fetchOrderItemsForReceipt(orderId),
    resolveReceiptSignature(createdBy),
  ]);

  const receiptNumber = buildReceiptNumber(order.order_number, payment.id);
  const description = buildReceiptDescription(items, order.order_number);
  const companyName = order.company?.name || 'Loja';
  const companyDocument = order.company?.document || null;
  const customerName = order.customer?.name || order.customer_name || 'Cliente';
  const customerDocument = order.customer?.document || null;
  const logoUrl = order.company?.logo_url
    ? ensurePublicStorageUrl('product-images', order.company.logo_url)
    : null;
  const signatureImageUrl = order.company?.signature_image_url
    ? ensurePublicStorageUrl('product-images', order.company.signature_image_url)
    : null;
  const responsibleName = order.company?.signature_responsible || signature?.name || companyName;
  const responsibleRole = order.company?.signature_role || signature?.cargo || 'Responsável';
  const address = buildCompanyAddress(order.company);
  const methodLabel = payment.method
    ? paymentMethodLabels[payment.method] || String(payment.method)
    : 'Não informado';
  const paidAt = payment.paid_at || payment.created_at || new Date().toISOString();

  const payload: PaymentReceiptPayload = {
    cliente: {
      nome: customerName,
      documento: customerDocument,
    },
    pagamento: {
      valor: Number(payment.amount || 0),
      forma: methodLabel,
      descricao: description,
      data: paidAt,
    },
    loja: {
      nome: companyName,
      documento: companyDocument,
      endereco: address,
      logo: logoUrl,
      assinaturaImagem: signatureImageUrl,
      responsavel: responsibleName,
      cargo: responsibleRole,
    },
    numeroRecibo: receiptNumber,
    referencia: {
      tipo: 'pedido',
      numero: formatOrderReference(order.order_number),
      codigo: payment.id.slice(0, 8).toUpperCase(),
    },
    pedido: {
      tempoProducaoDias: order.production_time_days_used ?? null,
      previsaoEntrega: order.estimated_delivery_date ?? null,
    },
  };

  const safeCompanyId = order.company_id || 'company';
  const path = `${safeCompanyId}/${order.id}/recibo-${receiptNumber}.pdf`;
  return generateAndUploadPaymentReceipt(payload, {
    bucket: 'payment-receipts',
    path,
  });
};

export type PaymentSummary = {
  orderTotal: number;
  paidTotal: number;
  creditUsedTotal: number;
  settledTotal: number;
  remaining: number;
  paymentStatus: PaymentStatus;
  generatedCreditTotal: number;
};

type OrderPaymentRpcPayload = {
  payment: OrderPayment | null;
  summary: PaymentSummary;
  orderNumber: number;
};

const normalizePaymentSummary = (payload: Partial<PaymentSummary> | null | undefined): PaymentSummary => {
  const orderTotal = Number(payload?.orderTotal ?? 0);
  const paidTotal = Number(payload?.paidTotal ?? 0);
  const creditUsedTotal = Number(payload?.creditUsedTotal ?? 0);
  const settledTotal = Number(payload?.settledTotal ?? paidTotal + creditUsedTotal);
  const remaining = Number(payload?.remaining ?? Math.max(0, orderTotal - settledTotal));
  const paymentStatus = (payload?.paymentStatus as PaymentStatus | undefined) ?? 'pendente';
  const generatedCreditTotal = Number(payload?.generatedCreditTotal ?? 0);

  return {
    orderTotal,
    paidTotal,
    creditUsedTotal,
    settledTotal,
    remaining,
    paymentStatus,
    generatedCreditTotal,
  };
};

const normalizeOrderPayment = (payload: any): OrderPayment | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return {
    ...payload,
    amount: Number(payload.amount ?? 0),
    generated_credit_amount: Number(payload.generated_credit_amount ?? 0),
    source: (payload.source as OrderPaymentSource | undefined) ?? 'manual',
  } as OrderPayment;
};

const normalizePaymentRpcPayload = (payload: any): OrderPaymentRpcPayload => ({
  payment: normalizeOrderPayment(payload?.payment),
  summary: normalizePaymentSummary(payload?.summary),
  orderNumber: Number(payload?.orderNumber ?? 0),
});

const fetchOrderPaymentSummary = async (orderId: string) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total, order_number, company_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw orderError || new Error('Pedido não encontrado');
  }

  const { data: payments, error: paymentsError } = await supabase
    .from('order_payments')
    .select('amount, status, source, generated_credit_amount')
    .eq('order_id', orderId);

  if (paymentsError) {
    throw paymentsError;
  }

  const totals = summarizeOrderPayments((payments as Array<{
    amount: number;
    status: PaymentStatus;
    source: OrderPaymentSource;
    generated_credit_amount: number;
  }> | null) || []);
  const summary = calculatePaymentSummary(
    Number(order.total),
    totals.cashPaidTotal,
    totals.creditUsedTotal,
    totals.generatedCreditTotal,
  );

  return { order, summary };
};

const updateOrderPaymentTotals = async (orderId: string) => {
  const { order, summary } = await fetchOrderPaymentSummary(orderId);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      amount_paid: summary.paidTotal,
      customer_credit_used: summary.creditUsedTotal,
      customer_credit_generated: summary.generatedCreditTotal,
      payment_status: summary.paymentStatus,
    })
    .eq('id', orderId);

  if (updateError) {
    throw updateError;
  }

  return { order, summary };
};

export const calculatePaymentSummary = (
  orderTotal: number,
  paidTotal: number,
  creditUsedTotal = 0,
  generatedCreditTotal = 0,
): PaymentSummary => {
  const total = Number(orderTotal);
  const paid = Number(paidTotal);
  const creditUsed = Number(creditUsedTotal);
  const settledTotal = paid + creditUsed;
  const remaining = Math.max(0, total - settledTotal);
  const paymentStatus: PaymentStatus =
    settledTotal >= total ? 'pago' : settledTotal > 0 ? 'parcial' : 'pendente';
  return {
    orderTotal: total,
    paidTotal: paid,
    creditUsedTotal: creditUsed,
    settledTotal,
    remaining,
    paymentStatus,
    generatedCreditTotal: Number(generatedCreditTotal),
  };
};

export const fetchOrderStatuses = async (): Promise<string[]> => {
  const { data, error } = await supabase.rpc('get_order_statuses' as any);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (typeof data[0] === 'string') {
      return data as string[];
    }
    if (typeof data[0] === 'object' && data[0] !== null && 'status' in data[0]) {
      return (data as Array<{ status: string }>).map((item) => item.status);
    }
  }

  return [];
};

const resolveOrderCompanyId = async (
  orderId: string,
  userId?: string | null,
) => {
  const { data: order, error } = await supabase
    .from('orders')
    .select('company_id, created_by')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw error || new Error('Pedido não encontrado');
  }

  if (order.company_id) {
    return order.company_id;
  }

  let resolvedUserId = userId || order.created_by || null;

  if (!resolvedUserId) {
    const { data: authData } = await supabase.auth.getUser();
    resolvedUserId = authData.user.id || null;
  }

  if (!resolvedUserId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', resolvedUserId)
    .maybeSingle();

  if (profileError || !profile?.company_id) {
    return null;
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ company_id: profile.company_id })
    .eq('id', orderId);

  if (updateError) {
    throw updateError;
  }

  return profile.company_id;
};

export const getOrCreatePublicLink = async (orderId: string) => {
  const { data: existing, error: existingError } = await supabase
    .from('order_public_links')
    .select('token')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.token) {
    return existing.token;
  }

  const companyId = await resolveOrderCompanyId(orderId);
  if (!companyId) {
    throw new Error('Empresa não vinculada ao pedido');
  }

  const { data, error } = await supabase
    .from('order_public_links')
    .insert({ order_id: orderId })
    .select('token')
    .single();

  if (error) {
    throw error;
  }

  return data.token;
};

export const fetchOrderPayments = async (orderId: string) => {
  const { data, error } = await supabase
    .from('order_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
};

export type MergeableOrderCandidate = Pick<
  Order,
  | 'id'
  | 'order_number'
  | 'customer_id'
  | 'customer_name'
  | 'status'
  | 'subtotal'
  | 'discount'
  | 'total'
  | 'payment_status'
  | 'created_at'
>;

export const fetchMergeableCustomerOrders = async ({
  targetOrderId,
  customerId,
}: {
  targetOrderId: string;
  customerId: string;
}): Promise<MergeableOrderCandidate[]> => {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, status, subtotal, discount, total, payment_status, created_at, amount_paid, customer_credit_used')
    .eq('customer_id', customerId)
    .neq('id', targetOrderId)
    .is('deleted_at', null)
    .neq('status', 'cancelado')
    .eq('amount_paid', 0)
    .eq('customer_credit_used', 0)
    .order('created_at', { ascending: false });

  if (ordersError) {
    throw ordersError;
  }

  const candidates = (orders || []) as Array<
    MergeableOrderCandidate & { amount_paid?: number | null; customer_credit_used?: number | null }
  >;

  if (candidates.length === 0) {
    return [];
  }

  const candidateIds = candidates.map((order) => order.id);
  const { data: payments, error: paymentsError } = await supabase
    .from('order_payments')
    .select('order_id')
    .in('order_id', candidateIds);

  if (paymentsError) {
    throw paymentsError;
  }

  const blockedOrderIds = new Set((payments || []).map((payment) => payment.order_id));

  return candidates
    .filter((order) => !blockedOrderIds.has(order.id))
    .map(({ amount_paid: _amountPaid, customer_credit_used: _creditUsed, ...order }) => order);
};

export const mergeCustomerOrders = async ({
  targetOrderId,
  sourceOrderIds,
  userId,
}: {
  targetOrderId: string;
  sourceOrderIds: string[];
  userId?: string | null;
}) => {
  if (sourceOrderIds.length === 0) {
    throw new Error('Selecione pelo menos um pedido para agrupar');
  }

  const { data, error } = await supabase.rpc('merge_customer_orders' as any, {
    p_target_order_id: targetOrderId,
    p_source_order_ids: sourceOrderIds,
    p_user_id: userId || null,
  });

  if (error || !data) {
    throw error || new Error('Falha ao agrupar pedidos');
  }

  return data as Order;
};

type CreatePaymentInput = {
  orderId: string;
  amount: number;
  method: PaymentMethod | null;
  status?: PaymentStatus;
  paidAt?: string | null;
  notes?: string;
  createdBy?: string | null;
  orderDiscountType?: Order['discount_type'];
  orderDiscountValue?: number;
};

export const createOrderPayment = async ({
  orderId,
  amount,
  method,
  status = 'pago',
  paidAt,
  notes,
  createdBy,
}: CreatePaymentInput): Promise<{
  payment: OrderPayment | null;
  summary: PaymentSummary;
  orderNumber: number;
  receipt: ReceiptInfo | null;
}> => {
  if (!amount || amount <= 0) {
    throw new Error('Valor inválido');
  }

  const companyId = await resolveOrderCompanyId(orderId, createdBy || null);
  if (!companyId) {
    throw new Error('Empresa não vinculada ao pedido');
  }

  const order = await fetchOrderForReceipt(orderId);
  if (!order) {
    throw new Error('Pedido não encontrado');
  }

  const { data: existingPayments, error: existingPaymentsError } = await supabase
    .from('order_payments')
    .select('amount, status')
    .eq('order_id', orderId);

  if (existingPaymentsError) {
    throw existingPaymentsError;
  }

  const currentPaid = (existingPayments || [])
    .filter((payment) => payment.status !== 'pendente')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const remainingBefore = Math.max(0, Number(order.total) - currentPaid);

  if (remainingBefore <= 0) {
    throw new Error('Pedido já está quitado');
  }

  if (amount > remainingBefore) {
    throw new Error('Valor excede o saldo restante');
  }

  const resolvedPaidAt = status === 'pendente' ? null : paidAt || new Date().toISOString();

  const { data: payment, error: insertError } = await supabase
    .from('order_payments')
    .insert({
      order_id: orderId,
      company_id: companyId,
      amount,
      status,
      method,
      paid_at: resolvedPaidAt,
      created_by: createdBy || null,
      notes: notes || null,
    })
    .select('*')
    .single();

  if (insertError) {
    throw insertError;
  }

  if (status !== 'pendente') {
    const { error: financialError } = await supabase
      .from('financial_entries')
      .insert({
        company_id: companyId,
        type: 'receita',
        origin: 'venda',
        amount,
        status: 'pago',
        payment_method: method,
        description: `Receita de pedido ${formatOrderReference(order.order_number)}`,
        occurred_at: resolvedPaidAt || new Date().toISOString(),
        related_id: orderId,
        is_automatic: true,
        created_by: createdBy || null,
        updated_by: createdBy || null,
      } as any);

    if (financialError) {
      console.warn('Falha ao registrar entrada financeira', financialError);
    }
  }

  const updatedPaidTotal =
    currentPaid + (status === 'pendente' ? 0 : Number(amount));
  const summary = calculatePaymentSummary(Number(order.total), updatedPaidTotal);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      amount_paid: summary.paidTotal,
      payment_status: summary.paymentStatus,
      payment_method: method || order.payment_method,
    })
    .eq('id', orderId);

  if (updateError) {
    throw updateError;
  }

  if (companyId) {
    await supabase.from('order_notifications').insert({
      company_id: companyId,
      order_id: orderId,
      type: 'payment',
      title: `Pagamento recebido - Pedido ${formatOrderReference(order.order_number)}`,
      body: `Pagamento de R$ ${amount.toFixed(2)} registrado.`,
    });
  }

  let receipt: ReceiptInfo | null = null;
  if (payment && status !== 'pendente') {
    try {
      receipt = await generateReceiptForPayment({
        orderId,
        payment: payment as OrderPayment,
        orderData: order,
        createdBy: createdBy || null,
      });
    } catch (error) {
      console.warn('[receipt] failed to generate payment receipt', error);
    }
  }

  return {
    payment: payment as unknown as OrderPayment,
    summary,
    orderNumber: order.order_number,
    receipt,
  };
};

type ApplyCustomerCreditInput = {
  orderId: string;
  amount: number;
  notes?: string;
  createdBy?: string | null;
};

export const createOrderPaymentWithCredit = async ({
  orderId,
  amount,
  method,
  status = 'pago',
  paidAt,
  notes,
  createdBy,
  orderDiscountType,
  orderDiscountValue,
}: CreatePaymentInput): Promise<{
  payment: OrderPayment | null;
  summary: PaymentSummary;
  orderNumber: number;
  receipt: ReceiptInfo | null;
}> => {
  if (!amount || amount <= 0) {
    throw new Error('Valor invÃ¡lido');
  }

  const rpcParams: Record<string, unknown> = {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_status: status,
    p_notes: notes || null,
    p_paid_at: status === 'pendente' ? null : paidAt || null,
  };

  if (orderDiscountType) {
    rpcParams.p_order_discount_type = orderDiscountType;
  }

  if (orderDiscountValue !== undefined && orderDiscountValue !== null) {
    rpcParams.p_order_discount_value = orderDiscountValue;
  }

  const { data, error } = await supabase.rpc('record_order_payment_internal' as any, rpcParams);

  if (error) {
    throw error;
  }

  const result = normalizePaymentRpcPayload(data);
  const order = await fetchOrderForReceipt(orderId);

  if (!order) {
    throw new Error('Pedido nÃ£o encontrado');
  }

  let receipt: ReceiptInfo | null = null;
  if (result.payment && result.payment.status !== 'pendente') {
    try {
      receipt = await generateReceiptForPayment({
        orderId,
        payment: result.payment,
        orderData: order,
        createdBy: createdBy || null,
      });
    } catch (receiptError) {
      console.warn('[receipt] failed to generate payment receipt', receiptError);
    }
  }

  return {
    payment: result.payment,
    summary: result.summary,
    orderNumber: result.orderNumber || order.order_number,
    receipt,
  };
};

export const applyCustomerCreditToOrder = async ({
  orderId,
  amount,
  notes,
}: ApplyCustomerCreditInput): Promise<{
  payment: OrderPayment | null;
  summary: PaymentSummary;
  orderNumber: number;
}> => {
  if (!amount || amount <= 0) {
    throw new Error('Valor invÃ¡lido');
  }

  const { data, error } = await supabase.rpc('apply_customer_credit_to_order' as any, {
    p_order_id: orderId,
    p_amount: amount,
    p_notes: notes || null,
  });

  if (error) {
    throw error;
  }

  return normalizePaymentRpcPayload(data);
};

type UpdateStatusInput = {
  orderId: string;
  status: OrderStatus;
  notes?: string;
  userId?: string | null;
  entrada?: number | null;
  paymentMethod?: PaymentMethod | null;
};

type MarkOrderItemsDeliveredInput = {
  orderId: string;
  itemIds: string[];
  userId?: string | null;
};

type MarkOrderItemsReadyInput = {
  orderId: string;
  itemIds: string[];
  userId?: string | null;
};

type UpdateOrderItemStatusInput = {
  orderId: string;
  itemId: string;
  status: OrderStatus;
  notes?: string;
  userId?: string | null;
};

type OrderItemUpdate = Pick<
  OrderItem,
  | 'id'
  | 'product_id'
  | 'product_name'
  | 'quantity'
  | 'unit_price'
  | 'discount_type'
  | 'discount_value'
  | 'discount'
  | 'notes'
  | 'attributes'
>;

const shouldFallbackToOrderEdgeRpc = (error: unknown) => {
  const code = String((error as { code?: string } | undefined)?.code || '');
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();

  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('schema cache') ||
    message.includes('function public.update_order_items')
  );
};

export const updateOrderItems = async (params: {
  orderId: string;
  items: OrderItemUpdate[];
  orderDiscountType?: Order['discount_type'];
  orderDiscountValue?: number;
}) => {
  const { data, error } = await supabase.rpc('update_order_items' as any, {
    p_order_id: params.orderId,
    p_items: params.items,
    p_order_discount_type: params.orderDiscountType ?? 'fixed',
    p_order_discount_value: params.orderDiscountValue ?? 0,
  });

  if (!error && data) {
    return data as Order;
  }

  if (error && (!EDGE_FUNCTIONS_ENABLED || !shouldFallbackToOrderEdgeRpc(error))) {
    throw error;
  }

  const payload = {
    items: params.items,
    order_discount_type: params.orderDiscountType ?? 'fixed',
    order_discount_value: params.orderDiscountValue ?? 0,
  };

  if (EDGE_FUNCTIONS_ENABLED) {
    try {
      const response = await invokeEdgeFunction<{ order: Order }>(
        'orders',
        payload,
        {
          method: 'PATCH',
          path: `/${params.orderId}/items`,
          resetAuthOn401: false,
        },
      );
      return response.order;
    } catch (edgeError) {
      throw edgeError;
    }
  }

  throw error || new Error('Falha ao atualizar itens do pedido');
};

export const markOrderItemsDelivered = async ({
  orderId,
  itemIds,
  userId,
}: MarkOrderItemsDeliveredInput) => {
  const normalizedItemIds = itemIds.filter(Boolean);

  if (normalizedItemIds.length === 0) {
    throw new Error('Selecione pelo menos um item para entregar');
  }

  const { data, error } = await supabase.rpc('mark_order_items_delivered' as any, {
    p_order_id: orderId,
    p_item_ids: normalizedItemIds,
    p_user_id: userId || null,
  });

  if (error) {
    throw error;
  }

  return (data || null) as {
    order: Order | null;
    updated_item_ids: string[];
    delivery_completed: boolean;
  } | null;
};

export const markOrderItemsReady = async ({
  orderId,
  itemIds,
  userId,
}: MarkOrderItemsReadyInput) => {
  const normalizedItemIds = itemIds.filter(Boolean);

  if (normalizedItemIds.length === 0) {
    throw new Error('Selecione pelo menos um item para marcar como pronto');
  }

  const { data, error } = await supabase.rpc('mark_order_items_ready' as any, {
    p_order_id: orderId,
    p_item_ids: normalizedItemIds,
    p_user_id: userId || null,
  });

  if (error) {
    throw error;
  }

  return (data || null) as {
    order: Order | null;
    updated_item_ids: string[];
    ready_completed: boolean;
    status_updated: boolean;
  } | null;
};

export const updateOrderItemStatus = async ({
  orderId,
  itemId,
  status,
  notes,
  userId,
}: UpdateOrderItemStatusInput) => {
  const { data, error } = await supabase.rpc('update_order_item_status' as any, {
    p_order_id: orderId,
    p_item_id: itemId,
    p_status: status,
    p_notes: notes || null,
    p_user_id: userId || null,
  });

  if (error) {
    throw error;
  }

  return (data || null) as {
    order: Order | null;
    item: OrderItem | null;
  } | null;
};

export const updateOrderStatus = async ({
  orderId,
  status,
  notes,
  userId,
  entrada,
  paymentMethod,
}: UpdateStatusInput) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, company_id, customer_name, status, notes')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw orderError || new Error('Pedido não encontrado');
  }

  if (!isStatusTransitionAllowed(order.status as OrderStatus, status)) {
    throw new Error('Mudança de status não permitida');
  }

  if (order.status === 'cancelado' && status === 'pendente') {
    const role = await fetchUserRole(userId);
    if (!role || !['admin', 'atendente'].includes(role)) {
      throw new Error('Apenas Admin ou Atendente podem reativar pedidos cancelados');
    }
  }

  const fromLabel =
    statusLabels[order.status as OrderStatus] ??
    formatStatusLabel(String(order.status));
  const toLabel = statusLabels[status] ?? formatStatusLabel(String(status));
  const transitionNote = `Status alterado de ${fromLabel} para ${toLabel}.`;
  const historyNotes = notes ? `${transitionNote} ${notes}` : transitionNote;
  const deliveredAt = status === 'entregue' ? new Date().toISOString() : null;
  const updatePayload: Record<string, unknown> = {
    status,
    updated_by: userId || null,
    cancel_reason: status === 'cancelado' ? notes || null : null,
  };
  const statusChangedAt = new Date().toISOString();

  if (order.status === 'pendente' && status !== 'pendente') {
    updatePayload.notes = stripPendingCustomerInfoNotes(order.notes);
  }

  if (status === 'entregue') {
    updatePayload.delivered_at = deliveredAt;
    updatePayload.delivered_by = userId || null;
  }

  const { data: updatedOrder, error: updateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  const itemStatusPayload: Record<string, unknown> = {
    status,
  };

  if (['finalizado', 'pronto', 'aguardando_retirada', 'entregue'].includes(status)) {
    itemStatusPayload.ready_at = statusChangedAt;
    itemStatusPayload.ready_by = userId || null;
  }

  if (status === 'entregue') {
    itemStatusPayload.delivered_at = deliveredAt;
    itemStatusPayload.delivered_by = userId || null;
  }

  const { error: itemStatusError } = await (supabase
    .from('order_items')
    .update(itemStatusPayload as any)
    .eq('order_id', orderId)) as any;

  if (itemStatusError) {
    throw itemStatusError;
  }

  const { error: historyError } = await supabase
    .from('order_status_history')
    .insert({
      order_id: orderId,
      status,
      user_id: userId || null,
      notes: historyNotes,
    });

  if (historyError) {
    throw historyError;
  }

  if (order.company_id && order.status !== 'finalizado' && status === 'finalizado') {
    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity')
      .eq('order_id', orderId);

    if (orderItemsError) {
      throw orderItemsError;
    }

    const normalizedItems = ((orderItems || []) as Partial<OrderStockDeductionItem>[])
      .map((item) => ({
        product_id: item.product_id || null,
        product_name: item.product_name || 'Produto',
        quantity: Number(item.quantity || 0),
      }))
      .filter((item) => item.product_id && item.quantity > 0);

    await applyDirectProductStockDeduction({
      companyId: order.company_id,
      orderNumber: order.order_number,
      userId: userId || null,
      items: normalizedItems,
    });

    const normalizedProductIds = normalizedItems
      .map((item) => item.product_id)
      .filter((productId): productId is string => Boolean(productId));

    let compositionProductIds = new Set<string>();
    if (normalizedProductIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, stock_control_type')
        .in('id', normalizedProductIds)
        .eq('company_id', order.company_id);

      if (productsError) {
        throw productsError;
      }

      compositionProductIds = new Set(
        (productsData || [])
          .filter((product) => product.stock_control_type === 'composition')
          .map((product) => product.id),
      );
    }

    const compositionItems = normalizedItems.filter(
      (item) => item.product_id && compositionProductIds.has(item.product_id),
    );

    if (compositionItems.length > 0) {
      await consumeProductSupplies({
        companyId: order.company_id,
        orderId,
        userId: userId || null,
        items: compositionItems,
      });
    }

    await supabase.rpc('recalculate_product_sales_counts', {
      p_company_id: order.company_id,
    });
  }

  if (entrada && entrada > 0) {
    const resolvedMethod = paymentMethod || (updatedOrder.payment_method as PaymentMethod | null) || 'dinheiro';
    await createOrderPaymentWithCredit({
      orderId,
      amount: Number(entrada),
      method: resolvedMethod,
      status: 'pago',
      createdBy: userId || null,
    });
  }

  await createOrderNotification({
    companyId: order.company_id,
    orderId,
    type: 'status_change',
    title: `Pedido ${formatOrderReference(order.order_number)}`,
    body: `Status alterado para: ${statusLabels[status]}`,
  });

  if (updatedOrder) {
    return updatedOrder;
  }

  if (EDGE_FUNCTIONS_ENABLED) {
    try {
      const response = await invokeEdgeFunction<{ order: Order }>(
        'orders',
        { status, notes, entrada, payment_method: paymentMethod ?? null },
        {
          method: 'PATCH',
          path: `/${orderId}/status`,
          resetAuthOn401: false,
        }
      );

      if (entrada && entrada > 0) {
        try {
          const { data: latestPayment } = await supabase
            .from('order_payments')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestPayment && latestPayment.status !== 'pendente') {
            await generateReceiptForPayment({
              orderId,
              payment: latestPayment as OrderPayment,
              createdBy: userId || null,
            });
          }
        } catch (error) {
          console.warn('[receipt] failed to generate receipt after edge update', error);
        }
      }

      return response.order;
    } catch (edgeError) {
      throw edgeError;
    }
  }

  return null;
};

export const cancelOrder = async ({
  orderId,
  motivo,
  confirmPaid,
}: {
  orderId: string;
  motivo?: string;
  confirmPaid?: boolean;
}) => {
  const payload = { motivo: motivo || null, confirm_paid: Boolean(confirmPaid) };
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select('id, order_number, company_id, status, notes')
    .eq('id', orderId)
    .single();

  if (existingOrderError || !existingOrder) {
    throw existingOrderError || new Error('Falha ao localizar pedido');
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'cancelado',
      cancel_reason: motivo || null,
      cancelled_at: new Date().toISOString(),
      notes:
        existingOrder.status === 'pendente'
          ? stripPendingCustomerInfoNotes(existingOrder.notes)
          : undefined,
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error || !data) {
    throw error || new Error('Falha ao cancelar pedido');
  }

  const historyNotes = motivo ? `Cancelado: ${motivo}` : 'Cancelado';

  const { error: historyError } = await supabase
    .from('order_status_history')
    .insert({
      order_id: orderId,
      status: 'cancelado',
      user_id: null,
      notes: historyNotes,
    });

  if (historyError) {
    throw historyError;
  }

  await createOrderNotification({
    companyId: existingOrder.company_id,
    orderId,
    type: 'status_change',
    title: `Pedido ${formatOrderReference(existingOrder.order_number)}`,
    body: 'Status alterado para: Cancelado',
  });

  if (data) {
    return data as Order;
  }

  if (EDGE_FUNCTIONS_ENABLED) {
    const response = await invokeEdgeFunction<{ order: Order }>(
      'orders',
      payload,
      {
        method: 'PATCH',
        path: `/${orderId}/cancel`,
        resetAuthOn401: false,
      }
    );
    return response.order;
  }

  throw new Error('Falha ao cancelar pedido');
};

export const deleteOrder = async (orderId: string) => {
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select('id, status, deleted_at')
    .eq('id', orderId)
    .maybeSingle();

  if (existingOrderError) {
    throw existingOrderError;
  }

  if (!existingOrder) {
    throw new Error('Pedido não encontrado');
  }

  if (existingOrder.deleted_at) {
    return;
  }

  if (!['orcamento', 'pendente'].includes(existingOrder.status)) {
    throw new Error('Somente pedidos em orçamento ou pendente podem ser excluídos');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('orders')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id || null,
      updated_by: user?.id || null,
    } as any)
    .eq('id', orderId);

  if (!error) {
    return;
  }

  if (EDGE_FUNCTIONS_ENABLED) {
    await invokeEdgeFunction<{ ok: boolean }>(
      'orders',
      null,
      {
        method: 'DELETE',
        path: `/${orderId}`,
        resetAuthOn401: false,
      }
    );
    return;
  }

  throw error;
};

export const fetchPublicOrder = async (token: string) => {
  const { data, error } = await supabase.rpc('get_public_order', {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  return data as unknown as PublicOrderPayload | null;
};

export const approveOrderByToken = async (token: string) => {
  const { data, error } = await supabase.rpc('approve_order_by_token', {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  return data as unknown as PublicOrderPayload | null;
};

export const approveArtByToken = async (token: string) => {
  const { data, error } = await supabase.rpc('approve_art_by_token', {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  return data as unknown as PublicOrderPayload | null;
};

export const recordPaymentByToken = async (
  token: string,
  amount: number,
  method: PaymentMethod,
) => {
  const { data, error } = await supabase.rpc('record_order_payment_by_token', {
    p_token: token,
    p_amount: amount,
    p_method: method,
  });

  if (error) {
    throw error;
  }

  return data as unknown as PublicOrderPayload | null;
};

export const cancelOrderPayment = async (
  orderId: string,
  paymentId: string,
) => {
  const { data: originalPayment } = await supabase
    .from('order_payments')
    .select('amount, status, method')
    .eq('id', paymentId)
    .eq('order_id', orderId)
    .maybeSingle();

  const { data: payment, error: updateError } = await supabase
    .from('order_payments')
    .update({ status: 'pendente', paid_at: null })
    .eq('id', paymentId)
    .eq('order_id', orderId)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  const { order, summary } = await updateOrderPaymentTotals(orderId);

  if (order.company_id && originalPayment && originalPayment.status !== 'pendente') {
    await supabase.from('financial_entries').insert({
      company_id: order.company_id,
      type: 'despesa',
      origin: 'reembolso',
      amount: Number(originalPayment.amount || 0),
      status: 'pago',
      payment_method: originalPayment.method,
      description: `Estorno pagamento pedido ${formatOrderReference(order.order_number)}`,
      occurred_at: new Date().toISOString(),
      related_id: orderId,
      is_automatic: true,
    } as any);
  }

  if (order.company_id) {
    await supabase.from('order_notifications').insert({
      company_id: order.company_id,
      order_id: orderId,
      type: 'payment',
      title: `Pagamento cancelado - Pedido ${formatOrderReference(order.order_number)}`,
      body: `Um pagamento foi cancelado.`,
    });
  }

  return { payment, summary };
};

export const deleteOrderPayment = async (
  orderId: string,
  paymentId: string,
) => {
  const { data: originalPayment } = await supabase
    .from('order_payments')
    .select('amount, status, method')
    .eq('id', paymentId)
    .eq('order_id', orderId)
    .maybeSingle();

  const { data: payment, error: deleteError } = await supabase
    .from('order_payments')
    .delete()
    .eq('id', paymentId)
    .eq('order_id', orderId)
    .select('*')
    .single();

  if (deleteError) {
    throw deleteError;
  }

  const { order, summary } = await updateOrderPaymentTotals(orderId);

  if (order.company_id && originalPayment && originalPayment.status !== 'pendente') {
    await supabase.from('financial_entries').insert({
      company_id: order.company_id,
      type: 'despesa',
      origin: 'reembolso',
      amount: Number(originalPayment.amount || 0),
      status: 'pago',
      payment_method: originalPayment.method,
      description: `Estorno pagamento pedido ${formatOrderReference(order.order_number)}`,
      occurred_at: new Date().toISOString(),
      related_id: orderId,
      is_automatic: true,
    } as any);
  }

  if (order.company_id) {
    await supabase.from('order_notifications').insert({
      company_id: order.company_id,
      order_id: orderId,
      type: 'payment',
      title: `Pagamento excluído - Pedido ${formatOrderReference(order.order_number)}`,
      body: `Um pagamento foi removido.`,
    });
  }

  return { payment, summary };
};

export const cancelOrderPaymentWithCredit = async (
  orderId: string,
  paymentId: string,
) => {
  const { data, error } = await supabase.rpc('cancel_order_payment_internal' as any, {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });

  if (error) {
    throw error;
  }

  const result = normalizePaymentRpcPayload(data);
  return { payment: result.payment, summary: result.summary };
};

export const deleteOrderPaymentWithCredit = async (
  orderId: string,
  paymentId: string,
) => {
  const { data, error } = await supabase.rpc('delete_order_payment_internal' as any, {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });

  if (error) {
    throw error;
  }

  const result = normalizePaymentRpcPayload(data);
  return { payment: result.payment, summary: result.summary };
};

export const uploadOrderFinalPhoto = async (
  orderId: string,
  file: File,
  userId?: string | null
) => {
  try {
    const url = await uploadFile(file, 'order-final-photos', {
      path: buildOrderStorageUploadPath(orderId, file, 'foto-final'),
    });

    const { data: photo, error: dbError } = await supabase
      .from('order_final_photos' as any)
      .insert({
        order_id: orderId,
        storage_path: url,
        created_by: userId || null,
      })
      .select('*')
      .single();

    if (dbError) {
      await deleteFile(url);
      throw dbError;
    }

    return photo;
  } catch (err) {
    throw err;
  }
};

export const uploadOrderArtFile = async (
  orderId: string,
  file: File,
  userId?: string | null,
  options?: {
    customerId?: string | null;
    displayFileName?: string | null;
  },
) => {
  const displayFileName = sanitizeDisplayFileName(
    options?.displayFileName?.trim() || file.name || 'referencia',
    file.name,
    'referencia',
  );

  try {
    const url = await uploadFile(file, 'order-art-files', {
      path: buildOrderStorageUploadPath(orderId, file, 'arte'),
    });

    const { data: artFile, error: dbError } = await supabase
      .from('order_art_files' as any)
      .insert({
        order_id: orderId,
        customer_id: options?.customerId || null,
        storage_path: url,
        file_name: displayFileName,
        file_type: file.type || null,
        created_by: userId || null,
      })
      .select('*')
      .single();

    if (dbError) {
      await deleteFile(url);
      throw dbError;
    }

    return artFile;
  } catch (err) {
    throw err;
  }
};
