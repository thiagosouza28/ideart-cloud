import { forwardRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import type { Order, OrderItem, OrderPayment, PaymentMethod, PaymentStatus } from '@/types/database';

type PaymentReceiptSummary = {
  paidTotal: number;
  creditUsedTotal?: number;
  settledTotal?: number;
  remaining: number;
  paymentStatus: PaymentStatus;
};

type PaymentReceiptProps = {
  order: Order;
  items: OrderItem[];
  payment: OrderPayment;
  summary?: PaymentReceiptSummary | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
};

const documentLabel = (value?: string | null) => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 ? `CNPJ: ${value}` : `CPF: ${value}`;
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pago: 'Pagamento total',
  parcial: 'Pagamento parcial',
  pendente: 'Pendente',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  credito: 'Cartão crédito',
  debito: 'Cartão débito',
  transferencia: 'Transferência',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const buildReceiptNumber = (orderNumber: number, paymentId: string) => {
  const suffix = paymentId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `REC-${orderNumber}-${suffix}`;
};

const buildReceiptDescription = (items: OrderItem[], orderNumber: number) => {
  const description = items
    .map((item) => `${item.quantity}x ${item.product_name}`)
    .filter(Boolean)
    .join(', ');

  const fallback = `pedido #${formatOrderNumber(orderNumber)}`;
  const resolved = description || fallback;
  return resolved.length > 180 ? `${resolved.slice(0, 177)}...` : resolved;
};

const PaymentReceipt = forwardRef<HTMLDivElement, PaymentReceiptProps>(
  ({ order, items, payment, summary }, ref) => {
    const company = order.company;
    const customerName = order.customer?.name || order.customer_name || 'Cliente não informado';
    const customerDocument = order.customer?.document || '-';
    const customerContact = order.customer?.phone || order.customer?.email || '-';
    const companyName = company?.name || 'Loja';
    const companyDocument = documentLabel(company?.document);
    const addressLine = company?.address ? `Endereço: ${company.address}` : '';
    const cityState = [company?.city, company?.state].filter(Boolean).join(' - ');
    const cityStateLine = cityState ? `Cidade/UF: ${cityState}` : '';
    const paymentDate = payment.paid_at || payment.created_at || order.created_at;
    const paymentMethod = payment.method ? paymentMethodLabels[payment.method] || payment.method : 'Não informado';
    const paymentStatus = summary?.paymentStatus || order.payment_status || 'pendente';
    const paidTotal = Number(summary?.paidTotal ?? order.amount_paid ?? 0);
    const creditUsedTotal = Number(summary?.creditUsedTotal ?? order.customer_credit_used ?? 0);
    const settledTotal = Number(summary?.settledTotal ?? paidTotal + creditUsedTotal);
    const remaining = Math.max(0, Number(summary?.remaining ?? Number(order.total || 0) - settledTotal));
    const receiptNumber = buildReceiptNumber(order.order_number, payment.id);
    const internalCode = payment.id.slice(0, 8).toUpperCase();
    const description = buildReceiptDescription(items, order.order_number);
    const receivedText = `Recebemos de ${customerName} o valor de ${formatCurrency(Number(payment.amount || 0))}, referente a ${description}.`;

    return (
      <div
        ref={ref}
        className="receipt-root receipt-fixed-width mx-auto shrink-0 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-none"
      >
        <div className="receipt-block border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt="Logo da loja"
                    className="h-11 w-11 rounded-md border border-slate-200 bg-white object-contain p-1"
                  />
                )}
                <div>
                  <p className="text-lg font-semibold leading-tight text-slate-800">{companyName}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Comprovante de pagamento
                  </p>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                {companyDocument && <p>{companyDocument}</p>}
                {addressLine && <p>{addressLine}</p>}
                {cityStateLine && <p>{cityStateLine}</p>}
                {company?.phone && <p>Tel: {company.phone}</p>}
                {company?.email && <p>{company.email}</p>}
              </div>
            </div>
            <div className="min-w-[182px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-right text-[11px]">
              <p className="uppercase tracking-wide text-slate-400">Recibo</p>
              <p className="text-base font-semibold text-slate-800">{receiptNumber}</p>
              <p className="mt-2 uppercase tracking-wide text-slate-400">Emitido em</p>
              <p className="font-medium text-slate-700">{formatDateTime(paymentDate)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
          <div>
            <p className="uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-900">{customerName}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Pedido</p>
            <p className="font-semibold text-slate-900">#{formatOrderNumber(order.order_number)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Forma</p>
            <p className="font-semibold text-slate-900">{paymentMethod}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Valor</p>
            <p className="font-semibold text-slate-900">{formatCurrency(Number(payment.amount || 0))}</p>
          </div>
        </div>

        <div className="receipt-block mt-4 rounded-xl border border-slate-200 p-3 text-[11px]">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Descrição</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{receivedText}</p>
        </div>

        <div className="receipt-block mt-4 rounded-xl border border-slate-200 p-3 text-[11px]">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-900">{customerName}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Documento</p>
              <p className="font-medium text-slate-700">{customerDocument}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Contato</p>
              <p className="font-medium text-slate-700">{customerContact}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 rounded-xl border border-slate-200 p-3 text-[11px]">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Forma</span>
                <span className="font-medium text-slate-900">{paymentMethod}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Valor recebido</span>
                <span className="font-medium text-slate-900">{formatCurrency(Number(payment.amount || 0))}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Status do pagamento</span>
                <span className="font-medium text-slate-900">{paymentStatusLabels[paymentStatus]}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Total pago no pedido</span>
                <span className="font-medium text-slate-900">{formatCurrency(paidTotal)}</span>
              </div>
              {creditUsedTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Crédito usado</span>
                  <span className="font-medium text-slate-900">{formatCurrency(creditUsedTotal)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Saldo restante</span>
                <span className="font-medium text-slate-900">{formatCurrency(remaining)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Código interno</span>
                <span className="font-medium text-slate-900">{internalCode}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-6 grid grid-cols-2 gap-4">
          <div className="flex min-h-[138px] flex-col items-center rounded-xl border border-slate-200 px-4 py-3 text-center text-[11px]">
            <p className="w-full text-[10px] uppercase tracking-wide text-slate-500">Assinatura da loja</p>
            <div className="mt-3 flex min-h-[64px] w-full items-end justify-center">
              {company?.signature_image_url ? (
                <img
                  src={company.signature_image_url}
                  alt="Assinatura da loja"
                  className="h-14 max-w-[220px] object-contain"
                />
              ) : (
                <div className="h-14 w-full max-w-[220px] border-b border-dashed border-slate-300" />
              )}
            </div>
            <p className="mt-3 text-center text-sm font-medium italic text-slate-900">
              {company?.signature_responsible || companyName}
            </p>
            {company?.signature_role && (
              <p className="text-center text-[10px] text-slate-500">{company.signature_role}</p>
            )}
          </div>

          <div className="flex min-h-[138px] flex-col items-center rounded-xl border border-slate-200 px-4 py-3 text-center text-[11px]">
            <p className="w-full text-[10px] uppercase tracking-wide text-slate-500">Assinatura do cliente</p>
            <div className="mt-3 flex min-h-[64px] w-full items-end justify-center">
              <div className="w-full max-w-[220px] border-b border-dashed border-slate-300" />
            </div>
            <p className="mt-3 text-center text-sm font-medium text-slate-900">{customerName}</p>
          </div>
        </div>

        <div className="receipt-block mt-5 text-center text-[11px] text-slate-500">
          <p>Documento não fiscal</p>
          <p className="mt-1">Obrigado pela preferência!</p>
        </div>
      </div>
    );
  },
);

PaymentReceipt.displayName = 'PaymentReceipt';

export default PaymentReceipt;
