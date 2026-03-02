import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { invokePublicFunction } from '@/services/publicFunctions';
import type { PixGateway, PixKeyType } from '@/types/database';

export type CompanyPaymentSettings = {
  id: string;
  pix_enabled: boolean;
  pix_gateway: PixGateway | null;
  pix_key_type: PixKeyType | null;
  pix_key: string | null;
  pix_beneficiary_name: string | null;
  mp_access_token_masked: string | null;
  pagseguro_token_masked: string | null;
  mp_access_token_set: boolean;
  pagseguro_token_set: boolean;
  updated_at: string;
};

export type UpdateCompanyPaymentSettingsPayload = {
  pix_enabled?: boolean;
  pix_gateway?: PixGateway | null;
  pix_key_type?: PixKeyType | null;
  pix_key?: string | null;
  pix_beneficiary_name?: string | null;
  mp_access_token?: string | null;
  pagseguro_token?: string | null;
  admin_password?: string;
};

export type PublicPixPaymentPayload = {
  company_id?: string;
  order_id: string;
  public_token: string;
};

export type PublicPixPaymentResult = {
  order_id: string;
  order_number: number;
  amount: number;
  gateway: PixGateway;
  payment_status: 'pendente' | 'pago' | 'parcial';
  payment_id: string;
  payment_qr_code: string | null;
  payment_copy_paste: string;
  public_token: string;
  public_order_url: string;
};

export const fetchCompanyPaymentSettings = () =>
  invokeEdgeFunction<CompanyPaymentSettings>('company-payment-settings', undefined, {
    method: 'GET',
    resetAuthOn401: false,
  });

export const updateCompanyPaymentSettings = (payload: UpdateCompanyPaymentSettingsPayload) =>
  invokeEdgeFunction<CompanyPaymentSettings>('company-payment-settings', payload, {
    method: 'PATCH',
    resetAuthOn401: false,
  });

export const createPublicPixPayment = (payload: PublicPixPaymentPayload) =>
  invokePublicFunction<PublicPixPaymentResult>('create-pix-payment', payload, {
    method: 'POST',
  });

export type PaymentWebhookLog = {
  id: string;
  gateway: string;
  event_type: string | null;
  external_event_id: string | null;
  payment_id: string | null;
  status: string | null;
  signature_valid: boolean | null;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
};

export const fetchPaymentWebhookLogs = async (limit = 100): Promise<PaymentWebhookLog[]> => {
  const { data, error } = await supabase
    .from('payment_webhook_logs')
    .select(
      'id, gateway, event_type, external_event_id, payment_id, status, signature_valid, error_message, received_at, processed_at',
    )
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []) as PaymentWebhookLog[];
};
