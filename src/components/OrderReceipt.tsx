import { forwardRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Order, OrderItem, OrderPayment, PaymentStatus, PaymentMethod } from '@/types/database';
import { formatAreaM2, parseM2Attributes, stripM2Attributes } from '@/lib/measurements';

interface OrderReceiptProps {
  order: Order;
  items: OrderItem[];
  payment?: OrderPayment | null;
  summary?: {
    paidTotal: number;
    remaining: number;
    paymentStatus: PaymentStatus;
  } | null;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d: string) =>
  new Date(d).toLocaleString('pt-BR');

const documentLabel = (value?: string | null) => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 ? `CNPJ: ${value}` : `CPF: ${value}`;
};

const orderStatusLabels: Record<Order['status'], string> = {
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

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pago: 'Pagamento total',
  parcial: 'Pagamento parcial',
  pendente: 'Pendente',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const extractVisibleNotes = (value?: string | null) => {
  if (!value) return '';
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('[meta]'))
    .join('\n')
    .trim();
};

const OrderReceipt = forwardRef<HTMLDivElement, OrderReceiptProps>(
  ({ order, items, payment, summary }, ref) => {
    const paidTotal = Number(summary?.paidTotal ?? order.amount_paid ?? 0);
    const remaining = Math.max(0, Number(summary?.remaining ?? Number(order.total) - paidTotal));
    const paymentStatus =
      summary?.paymentStatus ??
      (paidTotal >= Number(order.total)
        ? 'pago'
        : paidTotal > 0
          ? 'parcial'
          : 'pendente');
    const receiptTitle = payment ? 'Comprovante de pagamento' : 'Comprovante do pedido';
    const receiptDate = payment?.paid_at || payment?.created_at || order.created_at;
    const paymentMethodValue = payment?.method || order.payment_method;
    const paymentMethodLabel = paymentMethodValue ? paymentMethodLabels[paymentMethodValue] : '-';
    const company = order.company;
    const companyName = company?.name || receiptTitle;
    const visibleOrderNotes = extractVisibleNotes(order.notes);
    const addressLine = company?.address ? `Endereço: ${company.address}` : '';
    const cityState = [company?.city, company?.state].filter(Boolean).join(' - ');
    const cityStateLine = cityState ? `Cidade/UF: ${cityState}` : '';
    const contactLines: string[] = [];
    const storeDocument = documentLabel(company?.document);
    const customerLabel = order.customer?.name || order.customer_name || 'Cliente não informado';
    const totalLabel = formatCurrency(Number(order.total));

    if (company?.phone) contactLines.push(`Tel: ${company.phone}`);
    if (company?.whatsapp && company?.whatsapp !== company?.phone) {
      contactLines.push(`WhatsApp: ${company.whatsapp}`);
    }

    return (
      <div
        ref={ref}
        className="receipt-root w-full max-w-[794px] mx-auto rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm"
      >
        <div className="receipt-block border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt="Logo da loja"
                    className="h-12 w-12 rounded-md border border-slate-200 bg-white object-contain p-1"
                  />
                )}
                <div>
                  <p className="text-lg font-semibold leading-tight">{companyName}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{receiptTitle}</p>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                {addressLine && <p>{addressLine}</p>}
                {cityStateLine && <p>{cityStateLine}</p>}
                {storeDocument && <p>{storeDocument}</p>}
                {contactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {company?.email && <p>{company.email}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-[11px]">
              <p className="uppercase tracking-wide text-slate-500">Pedido</p>
              <p className="text-sm font-semibold">#{formatOrderNumber(order.order_number)}</p>
              <p className="mt-1 uppercase tracking-wide text-slate-500">Emitido em</p>
              <p className="font-medium">{formatDate(receiptDate)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] sm:grid-cols-4">
          <div>
            <p className="uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-900">{customerLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Status</p>
            <p className="font-semibold text-slate-900">{orderStatusLabels[order.status]}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Pagamento</p>
            <p className="font-semibold text-slate-900">{paymentStatusLabels[paymentStatus]}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Total</p>
            <p className="font-semibold text-slate-900">{totalLabel}</p>
          </div>
        </div>

        {(order.customer || order.customer_name) && (
          <div className="receipt-block mt-4 rounded-lg border border-slate-200 px-3 py-2 text-[11px]">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="uppercase tracking-wide text-slate-500">Cliente</p>
                <p className="font-semibold text-slate-900">{order.customer?.name || order.customer_name}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Documento</p>
                <p className="font-medium text-slate-700">{order.customer?.document || '-'}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Contato</p>
                <p className="font-medium text-slate-700">{order.customer?.phone || order.customer?.email || '-'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="receipt-block mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="receipt-table w-full text-[11px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-center font-medium">Qtd</th>
                <th className="px-3 py-2 text-right font-medium">Unitário</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const m2 = parseM2Attributes(item.attributes);
                const hasDimensions =
                  typeof m2.widthCm === 'number' &&
                  typeof m2.heightCm === 'number' &&
                  m2.widthCm > 0 &&
                  m2.heightCm > 0;
                const displayAttributes = stripM2Attributes(item.attributes);
                const attributesText = Object.values(displayAttributes).filter(Boolean).join(', ');
                const dimensionText = hasDimensions
                  ? `Dimensões: ${m2.widthCm}cm x ${m2.heightCm}cm | Área: ${formatAreaM2(Number(item.quantity))} m\u00B2`
                  : '';
                const details = [
                  dimensionText,
                  attributesText,
                  item.notes ? `Obs: ${item.notes}` : '',
                ]
                  .filter(Boolean)
                  .join(' | ');
                const quantityLabel = hasDimensions
                  ? `${formatAreaM2(Number(item.quantity))} m\u00B2`
                  : item.quantity;
                const unitLabel = hasDimensions ? ' / m\u00B2' : '';

                return (
                  <tr key={item.id} className="receipt-row border-t border-slate-200">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{item.product_name}</div>
                      {details && (
                        <div className="mt-1 text-[10px] text-slate-500">{details}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center align-top">{quantityLabel}</td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatCurrency(Number(item.unit_price))}
                      {unitLabel}
                    </td>
                    <td className="px-3 py-2 text-right font-medium align-top">
                      {formatCurrency(Number(item.total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="receipt-block mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatCurrency(Number(order.subtotal))}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Desconto</span>
                  <span>-{formatCurrency(Number(order.discount))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                <span>Total do pedido</span>
                <span>{formatCurrency(Number(order.total))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Status do pagamento</span>
                <span className="font-medium">{paymentStatusLabels[paymentStatus]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total pago</span>
                <span className="font-medium">{formatCurrency(paidTotal)}</span>
              </div>
              {remaining > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Saldo restante</span>
                  <span className="font-medium">{formatCurrency(remaining)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Forma</span>
                <span className="font-medium">{paymentMethodLabel}</span>
              </div>
              {payment && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Pagamento atual</span>
                  <span className="font-medium">{formatCurrency(Number(payment.amount))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {visibleOrderNotes && (
          <div className="receipt-block mt-4 rounded-lg border border-slate-200 p-3 text-[11px] space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Observações</p>
            <p className="text-slate-700 whitespace-pre-line">{visibleOrderNotes}</p>
          </div>
        )}

        <div className="receipt-block mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Assinatura da loja</p>
            <div className="mt-2 flex min-h-[64px] items-end">
              {company?.signature_image_url ? (
                <img
                  src={company.signature_image_url}
                  alt="Assinatura da loja"
                  className="h-14 max-w-[220px] object-contain"
                />
              ) : (
                <div className="h-14 w-full border-b border-dashed border-slate-300" />
              )}
            </div>
            <p className="mt-2 text-sm font-medium italic text-slate-900">
              {company?.signature_responsible || companyName}
            </p>
            {company?.signature_role && (
              <p className="text-[10px] text-slate-500">{company.signature_role}</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Assinatura do cliente</p>
            <div className="mt-2 flex min-h-[64px] items-end">
              <div className="w-full border-b border-dashed border-slate-300" />
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {order.customer?.name || order.customer_name || 'Cliente'}
            </p>
          </div>
        </div>

        <div className="receipt-block mt-5 text-center text-[11px] text-slate-500">
          <p>Documento nao fiscal</p>
          <p className="mt-1">Obrigado pela preferencia!</p>
        </div>
      </div>
    );
  },
);

OrderReceipt.displayName = 'OrderReceipt';

export default OrderReceipt;


