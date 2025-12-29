import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import type {
  Order,
  OrderPayment,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PublicOrderPayload,
} from '@/types/database';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  em_producao: 'Em Produção',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const statusTransitions: Record<OrderStatus, OrderStatus[]> = {
  orcamento: ['pendente', 'cancelado'],
  pendente: ['em_producao', 'cancelado'],
  em_producao: ['pronto', 'cancelado'],
  pronto: ['aguardando_retirada', 'cancelado'],
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
}> => {
  if (!amount || amount <= 0) {
    throw new Error('Valor inválido');
  }

  const companyId = await resolveOrderCompanyId(orderId, createdBy || null);
  if (!companyId) {
    throw new Error('Empresa não vinculada ao pedido');
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total, order_number, payment_method, amount_paid')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw orderError || new Error('Pedido não encontrado');
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

  return { payment: payment as unknown as OrderPayment, summary, orderNumber: order.order_number };
};

type UpdateStatusInput = {
  orderId: string;
  status: OrderStatus;
  notes?: string;
  userId?: string | null;
};

export const updateOrderStatus = async ({
  orderId,
  status,
  notes,
  userId,
}: UpdateStatusInput) => {
  if (EDGE_FUNCTIONS_ENABLED) {
    try {
      const response = await invokeEdgeFunction<{ order: Order }>(
        'orders',
        { status, notes },
        { method: 'PATCH', path: `/${orderId}/status` }
      );

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
  const fileName = `${orderId}/${crypto.randomUUID()}.${fileExt}`;

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
