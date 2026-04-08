import { forwardRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Order, OrderItem, OrderPayment, PaymentStatus, PaymentMethod } from '@/types/database';
import { formatAreaM2, parseM2Attributes, stripM2Attributes } from '@/lib/measurements';
import { formatBusinessDaysLabel, formatDatePtBr, normalizeProductionTimeDays } from '@/lib/productionTime';
import { stripPendingCustomerInfoNotes } from '@/lib/orderMetadata';
import { extractVisibleOrderNotes } from '@/lib/orderNotes';
import { buildOrderStatusCustomization, getOrderStatusLabel } from '@/lib/orderStatusConfig';

interface OrderReceiptProps {
  order: Order;
  items: OrderItem[];
  payment?: OrderPayment | null;
  summary?: {
    paidTotal: number;
    creditUsedTotal?: number;
    settledTotal?: number;
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
  credito: 'Cartão crédito',
  debito: 'Cartão débito',
  transferencia: 'Transferência',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const deliveryMethodLabels = {
  retirada: 'Retirada na loja',
  entrega: 'Entrega',
  motoboy: 'Motoboy',
} as const;

const paymentConditionLabels: Record<string, string> = {
  avista: 'À vista',
  '7dias': '7 dias',
  '15dias': '15 dias',
  '30dias': '30 dias',
  '45dias': '45 dias',
  entrada_saldo: 'Entrada + saldo',
};

const OrderReceipt = forwardRef<HTMLDivElement, OrderReceiptProps>(
  ({ order, items, payment, summary }, ref) => {
    const paidTotal = Number(summary?.paidTotal ?? order.amount_paid ?? 0);
    const creditUsedTotal = Number(summary?.creditUsedTotal ?? order.customer_credit_used ?? 0);
    const settledTotal = Number(summary?.settledTotal ?? paidTotal + creditUsedTotal);
    const remaining = Math.max(0, Number(summary?.remaining ?? Number(order.total) - settledTotal));
    const paymentStatus =
      summary?.paymentStatus ??
      (settledTotal >= Number(order.total)
        ? 'pago'
        : settledTotal > 0
          ? 'parcial'
          : 'pendente');
    const receiptTitle = 'Comprovante do pedido';
    const receiptDate = payment?.paid_at || payment?.created_at || order.created_at;
    const paymentMethodValue = payment?.method || order.payment_method;
    const paymentMethodLabel = paymentMethodValue ? paymentMethodLabels[paymentMethodValue] : '-';
    const company = order.company;
    const companyName = company?.name || receiptTitle;
    const statusCustomization = buildOrderStatusCustomization(company?.order_status_customization);
    const visibleOrderNotes =
      order.show_notes_on_pdf === false
        ? ''
        : extractVisibleOrderNotes(
            order.status === 'pendente'
              ? order.notes
              : stripPendingCustomerInfoNotes(order.notes),
          );
    const addressLine = company?.address ? `Endereço: ${company.address}` : '';
    const cityState = [company?.city, company?.state].filter(Boolean).join(' - ');
    const cityStateLine = cityState ? `Cidade/UF: ${cityState}` : '';
    const contactLines: string[] = [];
    const storeDocument = documentLabel(company?.document);
    const customerLabel = order.customer?.name || order.customer_name || 'Cliente não informado';
    const totalLabel = formatCurrency(Number(order.total));
    const freightAmount = Number(order.freight_amount ?? 0);
    const deliveryMethodLabel = order.delivery_method
      ? deliveryMethodLabels[order.delivery_method as keyof typeof deliveryMethodLabels] || order.delivery_method
      : '-';
    const paymentConditionLabel = order.payment_condition
      ? paymentConditionLabels[order.payment_condition] || order.payment_condition.trim()
      : '-';
    const productionTimeDays = normalizeProductionTimeDays(order.production_time_days_used);
    const estimatedDeliveryDateLabel = order.estimated_delivery_date
      ? formatDatePtBr(order.estimated_delivery_date)
      : null;

    if (company?.phone) contactLines.push(`Tel: ${company.phone}`);
    if (company?.whatsapp && company?.whatsapp !== company?.phone) {
      contactLines.push(`WhatsApp: ${company.whatsapp}`);
    }

    return (
      <div
        ref={ref}
        className="receipt-root receipt-fixed-width mx-auto shrink-0 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-none"
      >
        <div className="receipt-block border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                {company?.logo_url && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center self-center overflow-hidden rounded-full border border-slate-200 bg-white p-1">
                    <img
                      src={company.logo_url}
                      alt="Logo da loja"
                      className="max-h-full max-w-full object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <div className="flex min-h-10 flex-col justify-center gap-0.5">
                  <p className="text-[17px] font-semibold leading-none text-slate-800">{companyName}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    {receiptTitle}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-[10px] leading-none text-slate-600">
                {addressLine && <p>{addressLine}</p>}
                {cityStateLine && <p>{cityStateLine}</p>}
                {storeDocument && <p>{storeDocument}</p>}
                {contactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {company?.email && <p>{company.email}</p>}
              </div>
            </div>
            <div className="min-w-[136px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px]">
              <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400">Pedido</p>
              <p className="mt-1 text-[22px] font-bold leading-none text-slate-800">
                #{formatOrderNumber(order.order_number)}
              </p>
              <p className="mt-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400">Emitido em</p>
              <p className="mt-1 text-[10px] font-medium text-slate-600">{formatDate(receiptDate)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
          <div>
            <p className="uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-900">{customerLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Status</p>
            <p className="font-semibold text-slate-900">
              {getOrderStatusLabel(order.status, statusCustomization, order.payment_status)}
            </p>
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
          <div className="receipt-block mt-4 rounded-xl border border-slate-200 px-3 py-2 text-[11px]">
            <div className="grid grid-cols-3 gap-2">
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

        {(productionTimeDays !== null || estimatedDeliveryDateLabel) && (
          <div className="receipt-block mt-4 rounded-xl border border-slate-200 px-3 py-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="uppercase tracking-wide text-slate-500">Tempo de produção</p>
                <p className="font-medium text-slate-700">
                  {productionTimeDays !== null
                    ? formatBusinessDaysLabel(productionTimeDays)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Previsão de entrega</p>
                <p className="font-medium text-slate-700">{estimatedDeliveryDateLabel || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {(freightAmount > 0 || order.delivery_method || order.payment_condition) && (
          <div className="receipt-block mt-4 rounded-xl border border-slate-200 px-3 py-2 text-[11px]">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="uppercase tracking-wide text-slate-500">Método de entrega</p>
                <p className="font-medium text-slate-700">{deliveryMethodLabel}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Condição de pagamento</p>
                <p className="font-medium text-slate-700">{paymentConditionLabel}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Taxa de entrega</p>
                <p className="font-medium text-slate-700">
                  {freightAmount > 0 ? formatCurrency(freightAmount) : 'Sem taxa'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="receipt-block mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="receipt-table w-full table-fixed text-[11px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="w-[40%] whitespace-nowrap px-3 py-2 text-left font-medium">Produto</th>
                <th className="w-[18%] whitespace-nowrap px-3 py-2 text-center font-medium">Status</th>
                <th className="w-[12%] whitespace-nowrap px-3 py-2 text-center font-medium">Qtd</th>
                <th className="w-[15%] whitespace-nowrap px-3 py-2 text-right font-medium">Unitário</th>
                <th className="w-[15%] whitespace-nowrap px-3 py-2 text-right font-medium">Total</th>
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
                  ? `Dimensões: ${m2.widthCm}cm x ${m2.heightCm}cm | Área: ${formatAreaM2(Number(item.quantity))} m²`
                  : '';
                const details = [
                  dimensionText,
                  attributesText,
                  item.notes ? `Obs: ${item.notes}` : '',
                ]
                  .filter(Boolean)
                  .join(' | ');
                const quantityLabel = hasDimensions
                  ? `${formatAreaM2(Number(item.quantity))} m²`
                  : item.quantity;
                const unitLabel = hasDimensions ? ' / m²' : '';
                const itemStatusLabel = getOrderStatusLabel(item.status, statusCustomization);
                const itemStatusMoment = item.delivered_at
                  ? `Entregue em ${formatDate(item.delivered_at)}`
                  : item.ready_at
                    ? `Pronto em ${formatDate(item.ready_at)}`
                    : null;

                return (
                  <tr key={item.id} className="receipt-row border-t border-slate-200">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{item.product_name}</div>
                      {details && (
                        <div className="mt-1 text-[10px] text-slate-500">{details}</div>
                      )}
                      {itemStatusMoment && (
                        <div className="mt-1 whitespace-nowrap text-[10px] text-slate-500">
                          {itemStatusMoment}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {itemStatusLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center align-top">{quantityLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                      {formatCurrency(Number(item.unit_price))}
                      {unitLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium align-top">
                      {formatCurrency(Number(item.total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="receipt-block mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3 text-[11px]">
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
              {freightAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Taxa de entrega</span>
                  <span>{formatCurrency(freightAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                <span>Total do pedido</span>
                <span>{formatCurrency(Number(order.total))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Status do pagamento</span>
                <span className="font-medium">{paymentStatusLabels[paymentStatus]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total pago</span>
                <span className="font-medium">{formatCurrency(paidTotal)}</span>
              </div>
              {creditUsedTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Crédito usado</span>
                  <span className="font-medium">{formatCurrency(creditUsedTotal)}</span>
                </div>
              )}
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
            </div>
          </div>
        </div>

        {visibleOrderNotes && (
          <div className="receipt-block mt-4 rounded-xl border border-slate-200 p-3 text-[11px] space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Observações</p>
            <p className="text-slate-700 whitespace-pre-line">{visibleOrderNotes}</p>
          </div>
        )}

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
            <p className="mt-3 text-center text-sm font-medium text-slate-900">
              {order.customer?.name || order.customer_name || 'Cliente'}
            </p>
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

OrderReceipt.displayName = 'OrderReceipt';

export default OrderReceipt;


