import { supabase } from '@/integrations/supabase/client';
import {
  defaultCompanyPaymentMethods,
  getActiveCompanyPaymentMethods,
  normalizeCompanyPaymentMethods,
  type CompanyPaymentMethodConfig,
} from '@/lib/paymentMethods';

type FetchCompanyPaymentMethodsOptions = {
  companyId?: string | null;
  activeOnly?: boolean;
};

export const fetchCompanyPaymentMethods = async (
  options: FetchCompanyPaymentMethodsOptions = {},
): Promise<CompanyPaymentMethodConfig[]> => {
  let query = supabase
    .from('payment_methods')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }

  if (options.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const resolved = normalizeCompanyPaymentMethods(data || [], options.companyId);
  return options.activeOnly ? getActiveCompanyPaymentMethods(resolved) : resolved;
};

export const saveCompanyPaymentMethods = async (
  companyId: string,
  methods: CompanyPaymentMethodConfig[],
): Promise<CompanyPaymentMethodConfig[]> => {
  const payload = methods.map((method) => ({
    company_id: companyId,
    type: method.type,
    name: method.name.trim() || defaultCompanyPaymentMethods.find((item) => item.type === method.type)?.name || method.type,
    fee_percentage: Number(method.fee_percentage || 0) || 0,
    is_active: method.is_active,
    description: method.description?.trim() || null,
    sort_order: Number(method.sort_order || 0) || 0,
  }));

  const { data, error } = await supabase
    .from('payment_methods')
    .upsert(payload, {
      onConflict: 'company_id,type',
    })
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return normalizeCompanyPaymentMethods(data || [], companyId);
};
