import { forwardRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { formatAreaM2, parseM2Attributes, stripM2Attributes } from '@/lib/measurements';
import { buildOrderStatusCustomization, getOrderStatusLabel } from '@/lib/orderStatusConfig';
import type { Order, OrderItem, PaymentMethod, PaymentStatus } from '@/types/database';

type DeliveryReceiptProps = {
  order: Order;
  items: OrderItem[];
  deliveredAt?: string | null;
  deliveredItemIds?: string[];
  payment?: DeliveryReceiptPaymentInfo | null;
};

export type DeliveryReceiptPaymentInfo = {
  amount: number;
  method: PaymentMethod | null;
  paidAt: string | null;
  totalPaid: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  credito: 'Cartao de credito',
  debito: 'Cartao de debito',
  transferencia: 'Transferencia',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Pagamento parcial',
  pago: 'Pago',
};

const getItemDeliveryLabel = (item: OrderItem, deliveredItemIdSet: Set<string>) => {
  if (deliveredItemIdSet.has(item.id)) {
    return 'Entregue neste comprovante';
  }

  if (item.delivered_at) {
    return 'Entregue anteriormente';
  }

  if (item.status === 'cancelado') {
    return 'Cancelado';
  }

  return 'Nao entregue';
};

const DeliveryReceipt = forwardRef<HTMLDivElement, DeliveryReceiptProps>(
  ({ order, items, deliveredAt, deliveredItemIds = [], payment }, ref) => {
    const deliveryMoment = deliveredAt || order.delivered_at || new Date().toISOString();
    const customerName = order.customer?.name || order.customer_name || 'Cliente nao informado';
    const customerPhone =
      order.customer?.phone ||
      (order as Order & { customer_phone?: string | null }).customer_phone ||
      '-';
    const companyName = order.company?.name || 'Loja';
    const companyAddress = [order.company?.address, [order.company?.city, order.company?.state].filter(Boolean).join(' - ')]
      .filter(Boolean)
      .join(', ');
    const orderTotal = Number(order.total || 0);
    const amountPaid = Number(order.amount_paid || 0);
    const creditUsed = Number(order.customer_credit_used || 0);
    const settledTotal = amountPaid + creditUsed;
    const pendingAmount = Math.max(0, orderTotal - settledTotal);
    const hasPendingAmount = order.payment_status !== 'pago' && pendingAmount > 0.009;
    const paymentMethodLabel = payment?.method ? paymentMethodLabels[payment.method] || payment.method : 'Nao informado';
    const paymentMoment = payment?.paidAt || null;
    const receiptTotalPaid = Math.max(Number(payment?.totalPaid || 0), settledTotal);
    const deliveredItemIdSet = new Set(deliveredItemIds.filter(Boolean));
    const activeItems = items.filter((item) => item.status !== 'cancelado');
    const deliveredActiveItems = activeItems.filter((item) => Boolean(item.delivered_at));
    const deliveredNowItems = items.filter((item) => deliveredItemIdSet.has(item.id));
    const deliveredNowTotal = deliveredNowItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const pendingActiveCount = Math.max(0, activeItems.length - deliveredActiveItems.length);
    const isTotalDelivery = activeItems.length > 0 && pendingActiveCount === 0;
    const deliveryTypeLabel = isTotalDelivery ? 'Entrega total' : 'Entrega parcial';
    const statusCustomization = buildOrderStatusCustomization(order.company?.order_status_customization);

    return (
      <div
        ref={ref}
        className="receipt-root mx-auto w-full max-w-[794px] rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm"
      >
        <div className="receipt-block border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {order.company?.logo_url && (
                  <img
                    src={order.company.logo_url}
                    alt="Logo da loja"
                    className="h-12 w-12 rounded-md border border-slate-200 bg-white object-contain p-1"
                    crossOrigin="anonymous"
                  />
                )}
                <div>
                  <p className="text-lg font-semibold leading-tight">{companyName}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    Comprovante de {deliveryTypeLabel.toLowerCase()}
                  </p>
                </div>
              </div>
              {companyAddress && (
                <p className="mt-2 text-[11px] text-slate-600">{companyAddress}</p>
              )}
              {order.company?.phone && (
                <p className="text-[11px] text-slate-600">Telefone: {order.company.phone}</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-[11px]">
              <p className="uppercase tracking-wide text-slate-500">Pedido</p>
              <p className="text-sm font-semibold">#{formatOrderNumber(order.order_number)}</p>
              <p className="mt-1 uppercase tracking-wide text-slate-500">Entrega registrada</p>
              <p className="font-medium">{formatDate(deliveryMoment)}</p>
              <p className="font-medium">{formatTime(deliveryMoment)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] sm:grid-cols-4">
          <div>
            <p className="uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-900">{customerName}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Telefone</p>
            <p className="font-semibold text-slate-900">{customerPhone}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Tipo da entrega</p>
            <p className="font-semibold text-slate-900">{deliveryTypeLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Valor total do pedido</p>
            <p className="font-semibold text-slate-900">{formatCurrency(orderTotal)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Itens nesta entrega</p>
            <p className="font-medium text-slate-900">
              {deliveredNowItems.length}/{activeItems.length || items.length}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Itens entregues no pedido</p>
            <p className="font-medium text-slate-900">
              {deliveredActiveItems.length}/{activeItems.length || items.length}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Itens pendentes</p>
            <p className="font-medium text-slate-900">{pendingActiveCount}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Valor desta entrega</p>
            <p className="font-medium text-slate-900">{formatCurrency(deliveredNowTotal)}</p>
          </div>
        </div>

        <div className="receipt-block mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="receipt-table w-full text-[11px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Produto / servico</th>
                <th className="px-3 py-2 text-center font-medium">Qtd</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-left font-medium">Entrega</th>
                <th className="px-3 py-2 text-left font-medium">Status atual</th>
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
                const attributesText = Object.values(stripM2Attributes(item.attributes)).filter(Boolean).join(', ');
                const details = [
                  hasDimensions
                    ? `Dimensoes: ${m2.widthCm}cm x ${m2.heightCm}cm | Area: ${formatAreaM2(Number(item.quantity))} m²`
                    : '',
                  attributesText,
                  item.notes ? `Obs: ${item.notes}` : '',
                ]
                  .filter(Boolean)
                  .join(' | ');
                const deliveryLabel = getItemDeliveryLabel(item, deliveredItemIdSet);
                const currentStatusLabel = getOrderStatusLabel(item.status, statusCustomization);

                return (
                  <tr key={item.id} className="receipt-row border-t border-slate-200">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{item.product_name}</div>
                      {details && <div className="mt-1 text-[10px] text-slate-500">{details}</div>}
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      {hasDimensions ? `${formatAreaM2(Number(item.quantity))} m²` : item.quantity}
                    </td>
                    <td className="px-3 py-2 text-right align-top font-medium">
                      {formatCurrency(Number(item.total || 0))}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <div className="font-medium">{deliveryLabel}</div>
                      {item.delivered_at && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {formatDate(item.delivered_at)} {formatTime(item.delivered_at)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <div className="font-medium">{currentStatusLabel}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {payment && (
          <div className="receipt-block mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] sm:grid-cols-3">
            <div>
              <p className="uppercase tracking-wide text-slate-500">Ultimo pagamento registrado</p>
              <p className="font-semibold text-slate-900">{formatCurrency(Number(payment.amount || 0))}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Forma de pagamento</p>
              <p className="font-semibold text-slate-900">{paymentMethodLabel}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Total pago no pedido</p>
              <p className="font-semibold text-slate-900">{formatCurrency(receiptTotalPaid)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Data do pagamento</p>
              <p className="font-medium text-slate-900">{paymentMoment ? formatDate(paymentMoment) : '-'}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Hora do pagamento</p>
              <p className="font-medium text-slate-900">{paymentMoment ? formatTime(paymentMoment) : '-'}</p>
            </div>
          </div>
        )}

        <div
          className={[
            'receipt-block mt-4 grid gap-2 rounded-lg border px-3 py-2 text-[11px] sm:grid-cols-3',
            hasPendingAmount
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200 bg-slate-50',
          ].join(' ')}
        >
          <div>
            <p className="uppercase tracking-wide text-slate-500">Situacao do pagamento</p>
            <p className="font-semibold text-slate-900">
              {paymentStatusLabels[order.payment_status] || order.payment_status}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Total recebido no pedido</p>
            <p className="font-semibold text-slate-900">{formatCurrency(settledTotal)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Saldo pendente</p>
            <p className="font-semibold text-slate-900">{formatCurrency(pendingAmount)}</p>
          </div>
          {creditUsed > 0 && (
            <div>
              <p className="uppercase tracking-wide text-slate-500">Credito utilizado</p>
              <p className="font-medium text-slate-900">{formatCurrency(creditUsed)}</p>
            </div>
          )}
          {hasPendingAmount && (
            <div className="sm:col-span-3">
              <p className="font-semibold text-slate-900">
                Pedido entregue com saldo pendente de {formatCurrency(pendingAmount)}.
              </p>
            </div>
          )}
        </div>

        <div className="receipt-block mt-5 rounded-lg border border-slate-200 p-4 text-[12px]">
          <p className="font-semibold text-slate-900">
            Declaro que recebi corretamente os itens descritos neste comprovante.
          </p>

          <div className="mt-5 grid gap-4">
            <div>
              <p>Assinatura do Cliente:</p>
              <div className="mt-8 border-b border-slate-400" />
            </div>
            <div>
              <p>Nome do Cliente:</p>
              <div className="mt-8 border-b border-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Nome registrado no pedido: {customerName}</p>
            </div>
            <div>
              <p>Data da Entrega: {formatDate(deliveryMoment)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-5 text-center text-[11px] text-slate-500">
          <p>{isTotalDelivery ? 'Comprovante de entrega total do pedido' : 'Comprovante de entrega parcial do pedido'}</p>
        </div>
      </div>
    );
  },
);

DeliveryReceipt.displayName = 'DeliveryReceipt';

export default DeliveryReceipt;
