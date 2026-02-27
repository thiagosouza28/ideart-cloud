import { supabase } from '@/integrations/supabase/client';
import type {
  FinancialEntry,
  FinancialEntryOrigin,
  FinancialEntryStatus,
  FinancialEntryType,
  PaymentMethod,
} from '@/types/database';

export type ManualCashEntryPayload = {
  type: FinancialEntryType;
  origin: FinancialEntryOrigin;
  amount: number;
  payment_method: PaymentMethod | null;
  description?: string | null;
  notes?: string | null;
  occurred_at: string;
  status?: FinancialEntryStatus;
  related_id?: string | null;
};

const MANUAL_ORIGINS = new Set<FinancialEntryOrigin>([
  'manual',
  'custo',
  'ajuste',
  'outros',
  'reembolso',
  'venda',
  'assinatura',
  'pdv',
]);

const normalizeOrigin = (origin: FinancialEntryOrigin): FinancialEntryOrigin => {
  if (MANUAL_ORIGINS.has(origin)) return origin;
  return 'manual';
};

const resolveAuthUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

export const createManualCashEntry = async (payload: ManualCashEntryPayload) => {
  const userId = await resolveAuthUserId();
  const status = payload.status || 'pago';
  const origin = normalizeOrigin(payload.origin);

  const { data, error } = await supabase
    .from('financial_entries')
    .insert({
      type: payload.type,
      origin,
      amount: Number(payload.amount || 0),
      payment_method: payload.payment_method,
      description: payload.description || null,
      notes: payload.notes || null,
      occurred_at: payload.occurred_at,
      status,
      related_id: payload.related_id || null,
      is_automatic: false,
      created_by: userId,
      updated_by: userId,
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return data as FinancialEntry;
};

export const updateManualCashEntry = async (
  entryId: string,
  payload: ManualCashEntryPayload,
) => {
  const userId = await resolveAuthUserId();
  const { data: current, error: currentError } = await supabase
    .from('financial_entries')
    .select('id, is_automatic')
    .eq('id', entryId)
    .single();

  if (currentError) throw currentError;
  if (current?.is_automatic) {
    throw new Error('Lançamentos automáticos não podem ser editados.');
  }

  const { data, error } = await supabase
    .from('financial_entries')
    .update({
      type: payload.type,
      origin: normalizeOrigin(payload.origin),
      amount: Number(payload.amount || 0),
      payment_method: payload.payment_method,
      description: payload.description || null,
      notes: payload.notes || null,
      occurred_at: payload.occurred_at,
      status: payload.status || 'pago',
      related_id: payload.related_id || null,
      updated_by: userId,
    } as any)
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) throw error;
  return data as FinancialEntry;
};

export const deleteManualCashEntry = async (entryId: string) => {
  const { data: current, error: currentError } = await supabase
    .from('financial_entries')
    .select('id, is_automatic')
    .eq('id', entryId)
    .single();

  if (currentError) throw currentError;
  if (current?.is_automatic) {
    throw new Error('Lançamentos automáticos não podem ser excluídos.');
  }

  const { error } = await supabase
    .from('financial_entries')
    .delete()
    .eq('id', entryId);

  if (error) throw error;
};

export type CashCreator = { id: string; full_name: string };
export type CashCompany = { id: string; name: string };

export const listCashCreators = async (companyId?: string | null) => {
  let query = supabase
    .from('profiles')
    .select('id, full_name, company_id')
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as Array<{ id: string; full_name: string }>)
    .map((item) => ({ id: item.id, full_name: item.full_name }))
    .filter((item) => Boolean(item.id));
};

export const listCashCompanies = async () => {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []) as CashCompany[];
};
