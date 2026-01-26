import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { generateAndUploadPaymentReceipt } from '@/services/paymentReceipts';
import { ensurePublicStorageUrl } from '@/lib/storage';
import type {
  AppRole,
  Order,
  OrderPayment,
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

const fetchUserRole = async (userId?: string | null) => {
  let resolvedUserId = userId || null;

  if (!resolvedUserId) {
    const { data } = await supabase.auth.getUser();
    resolvedUserId = data.user?.id || null;
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

type ReceiptInfo = {
  number: string;
  path: string;
  publicUrl: string | null;
};

const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
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
  const fallback = `Pedido #${orderNumber}`;
  const result = description || fallback;
  return result.length > 160 ? `${result.slice(0, 157)}...` : result;
};

const buildCompanyAddress = (company?: Order['company'] | null) => {
  const parts = [company?.address, [company?.city, company?.state].filter(Boolean).join(' - ')]
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '-';
};

const fetchOrderForReceipt = async (orderId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, company_id, customer_name, payment_method, amount_paid, total, company:companies(name, document, address, city, state, logo_url, signature_image_url, signature_responsible, signature_role), customer:customers(name, document)',
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
      resolvedUserId = data.user?.id || null;
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
  remaining: number;
  paymentStatus: PaymentStatus;
};

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
    .select('amount, status')
    .eq('order_id', orderId);

  if (paymentsError) {
    throw paymentsError;
  }

  const paidTotal = (payments || [])
    .filter((payment) => payment.status !== 'pendente')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const summary = calculatePaymentSummary(Number(order.total), paidTotal);

  return { order, summary };
};

const updateOrderPaymentTotals = async (orderId: string) => {
  const { order, summary } = await fetchOrderPaymentSummary(orderId);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      amount_paid: summary.paidTotal,
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
): PaymentSummary => {
  const total = Number(orderTotal);
  const paid = Number(paidTotal);
  const remaining = Math.max(0, total - paid);
  const paymentStatus: PaymentStatus =
    paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente';
  return { orderTotal: total, paidTotal: paid, remaining, paymentStatus };
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
    resolvedUserId = authData.user?.id || null;
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

type CreatePaymentInput = {
  orderId: string;
  amount: number;
  method: PaymentMethod | null;
  status?: PaymentStatus;
  notes?: string;
  createdBy?: string | null;
};

export const createOrderPayment = async ({
  orderId,
  amount,
  method,
  status = 'pago',
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

  const paidAt = status === 'pendente' ? null : new Date().toISOString();

  const { data: payment, error: insertError } = await supabase
    .from('order_payments')
    .insert({
      order_id: orderId,
      company_id: companyId,
      amount,
      status,
      method,
      paid_at: paidAt,
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
        origin: 'order_payment',
        amount,
        status: 'pago',
        payment_method: method,
        description: `Pagamento pedido #${order.order_number}`,
        occurred_at: paidAt || new Date().toISOString(),
        created_by: createdBy || null,
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
      title: `Pagamento recebido - Pedido #${order.order_number}`,
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

type UpdateStatusInput = {
  orderId: string;
  status: OrderStatus;
  notes?: string;
  userId?: string | null;
  entrada?: number | null;
  paymentMethod?: PaymentMethod | null;
};

type OrderItemUpdate = Pick<
  OrderItem,
  'id' | 'product_id' | 'product_name' | 'quantity' | 'unit_price' | 'discount' | 'notes' | 'attributes'
>;

export const updateOrderItems = async (params: {
  orderId: string;
  items: OrderItemUpdate[];
}) => {
  const payload = { items: params.items };

  if (EDGE_FUNCTIONS_ENABLED) {
    try {
      const response = await invokeEdgeFunction<{ order: Order }>(
        'orders',
        payload,
        { method: 'PATCH', path: `/${params.orderId}/items` },
      );
      return response.order;
    } catch (error) {
      if (!shouldFallbackToDirectUpdate(error)) {
        throw error;
      }
    }
  }

  const { data, error } = await supabase.rpc('update_order_items' as any, {
    p_order_id: params.orderId,
    p_items: params.items,
  });

  if (error || !data) {
    throw error || new Error('Falha ao atualizar itens do pedido');
  }

  return data as Order;
};

export const updateOrderStatus = async ({
  orderId,
  status,
  notes,
  userId,
  entrada,
  paymentMethod,
}: UpdateStatusInput) => {
  if (EDGE_FUNCTIONS_ENABLED) {
    try {
      const response = await invokeEdgeFunction<{ order: Order }>(
        'orders',
        { status, notes, entrada, payment_method: paymentMethod ?? null },
        { method: 'PATCH', path: `/${orderId}/status` }
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
    } catch (error) {
      if (!shouldFallbackToDirectUpdate(error)) {
        throw error;
      }
    }
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, company_id, customer_name, status')
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

  const { data: updatedOrder, error: updateError } = await supabase
    .from('orders')
    .update({
      status,
      updated_by: userId || null,
      cancel_reason: status === 'cancelado' ? notes || null : null,
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
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

  if (entrada && entrada > 0) {
    const resolvedMethod = paymentMethod || (updatedOrder.payment_method as PaymentMethod | null) || 'dinheiro';
    await createOrderPayment({
      orderId,
      amount: Number(entrada),
      method: resolvedMethod,
      status: 'pago',
      createdBy: userId || null,
    });
  }

  if (order.company_id) {
    await supabase.from('order_notifications').insert({
      company_id: order.company_id,
      order_id: orderId,
      type: 'status_change',
      title: `Pedido #${order.order_number}`,
      body: `Status alterado para: ${statusLabels[status]}`,
    });
  }

  return updatedOrder || null;
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
  if (EDGE_FUNCTIONS_ENABLED) {
    const response = await invokeEdgeFunction<{ order: Order }>(
      'orders',
      payload,
      { method: 'PATCH', path: `/${orderId}/cancel` }
    );
    return response.order;
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'cancelado',
      cancel_reason: motivo || null,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error || !data) {
    throw error || new Error('Falha ao cancelar pedido');
  }

  return data as Order;
};

export const deleteOrder = async (orderId: string) => {
  if (EDGE_FUNCTIONS_ENABLED) {
    await invokeEdgeFunction<{ ok: boolean }>(
      'orders',
      null,
      { method: 'DELETE', path: `/${orderId}` }
    );
    return;
  }

  const { error } = await supabase
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    throw error;
  }
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
      origin: 'order_payment_cancel',
      amount: Number(originalPayment.amount || 0),
      status: 'pago',
      payment_method: originalPayment.method,
      description: `Estorno pagamento pedido #${order.order_number}`,
      occurred_at: new Date().toISOString(),
    } as any);
  }

  if (order.company_id) {
    await supabase.from('order_notifications').insert({
      company_id: order.company_id,
      order_id: orderId,
      type: 'payment',
      title: `Pagamento cancelado - Pedido #${order.order_number}`,
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
      origin: 'order_payment_delete',
      amount: Number(originalPayment.amount || 0),
      status: 'pago',
      payment_method: originalPayment.method,
      description: `Estorno pagamento pedido #${order.order_number}`,
      occurred_at: new Date().toISOString(),
    } as any);
  }

  if (order.company_id) {
    await supabase.from('order_notifications').insert({
      company_id: order.company_id,
      order_id: orderId,
      type: 'payment',
      title: `Pagamento excluído - Pedido #${order.order_number}`,
      body: `Um pagamento foi removido.`,
    });
  }

  return { payment, summary };
};

export const uploadOrderFinalPhoto = async (
  orderId: string,
  file: File,
  userId?: string | null
) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${orderId}/${generateFileId()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('order-final-photos')
    .upload(fileName, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data: photo, error: dbError } = await supabase
    .from('order_final_photos')
    .insert({
      order_id: orderId,
      storage_path: fileName,
      created_by: userId || null,
    })
    .select('*')
    .single();

  if (dbError) {
    // Cleanup file if DB insert fails
    await supabase.storage.from('order-final-photos').remove([fileName]);
    throw dbError;
  }

  return photo;
};

export const uploadOrderArtFile = async (
  orderId: string,
  file: File,
  userId?: string | null
) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileExt = safeName.split('.').pop();
  const fileName = `${orderId}/${generateFileId()}-${fileExt ? safeName : `${safeName}.bin`}`;

  const { error: uploadError } = await supabase.storage
    .from('order-art-files')
    .upload(fileName, file, { contentType: file.type || undefined });

  if (uploadError) {
    throw uploadError;
  }

  const { data: artFile, error: dbError } = await supabase
    .from('order_art_files' as any)
    .insert({
      order_id: orderId,
      storage_path: fileName,
      file_name: file.name || safeName,
      file_type: file.type || null,
      created_by: userId || null,
    })
    .select('*')
    .single();

  if (dbError) {
    await supabase.storage.from('order-art-files').remove([fileName]);
    throw dbError;
  }

  return artFile;
};
