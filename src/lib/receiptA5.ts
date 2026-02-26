import type { PaymentReceiptPayload, ReceiptPersonType } from '@/templates/paymentReceiptTemplate';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleString('pt-BR');
};

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

const resolvePersonType = (
  documento?: string | null,
  tipoPessoa?: ReceiptPersonType | null,
): ReceiptPersonType => {
  if (tipoPessoa === 'PF' || tipoPessoa === 'PJ') return tipoPessoa;
  const digits = normalizeDigits(documento || '');
  return digits.length >= 14 ? 'PJ' : 'PF';
};

const resolveInternalCode = (payload: PaymentReceiptPayload) => {
  const fromReference = payload.referencia?.codigo?.trim();
  if (fromReference) return fromReference;
  const parts = (payload.numeroRecibo || '').split('-').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '-';
};

export const buildReceiptA5Url = (
  payload: PaymentReceiptPayload,
  options?: { autoPrint?: boolean },
) => {
  const params = new URLSearchParams();
  const personType = resolvePersonType(payload.loja.documento, payload.loja.tipoPessoa);
  const referenceType = payload.referencia?.tipo || 'pedido';
  const referenceNumber = payload.referencia?.numero || '-';

  params.set('store', payload.loja.nome || 'Loja');
  params.set('doc', payload.loja.documento || '-');
  params.set('personType', personType);
  params.set('address', payload.loja.endereco || '-');
  params.set('receipt', payload.numeroRecibo || '-');
  params.set('referenceType', referenceType);
  params.set('referenceNumber', referenceNumber);
  params.set('client', payload.cliente.nome || 'Cliente');
  params.set('description', payload.pagamento.descricao || '-');
  params.set('amount', formatCurrency(payload.pagamento.valor || 0));
  params.set('payment', payload.pagamento.forma || '-');
  params.set('date', formatDateTime(payload.pagamento.data || ''));
  params.set('internalCode', resolveInternalCode(payload));
  params.set('signature', payload.loja.responsavel || payload.loja.nome || 'Loja');
  if (payload.loja.logo) {
    params.set('logo', payload.loja.logo);
  }
  if (payload.loja.assinaturaImagem) {
    params.set('signatureImage', payload.loja.assinaturaImagem);
  }

  if (options?.autoPrint) {
    params.set('print', '1');
  }

  return `/comprovante-a5.html?${params.toString()}`;
};
