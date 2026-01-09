import { forwardRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Order, OrderItem, OrderPayment, PaymentStatus, PaymentMethod } from '@/types/database';

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
    const addressLine = company?.address ? `Endereço: ${company.address}` : '';
    const cityState = [company?.city, company?.state].filter(Boolean).join(' - ');
    const cityStateLine = cityState ? `Cidade/UF: ${cityState}` : '';
    const contactLines: string[] = [];
    const customerLabel = order.customer?.name || order.customer_name || 'Cliente não informado';
    const totalLabel = formatCurrency(Number(order.total));

    if (company?.phone) contactLines.push(`Tel: ${company.phone}`);
    if (company?.whatsapp && company?.whatsapp !== company?.phone) {
      contactLines.push(`WhatsApp: ${company.whatsapp}`);
    }

    return (
      <div
        ref={ref}
        className="receipt-root w-full max-w-[720px] mx-auto rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm"
      >
        <div className="receipt-fixed">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Pedido</p>
              <p className="font-semibold">#{formatOrderNumber(order.order_number)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold">{customerLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Status</p>
              <p className="font-semibold">{orderStatusLabels[order.status]}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
              <p className="font-semibold">{totalLabel}</p>
            </div>
          </div>
        </div>

        <div className="receipt-content">
          <div className="receipt-block flex flex-col items-center text-center gap-2 border-b border-slate-200 pb-4">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt="Logo"
                className="h-12 max-w-[180px] object-contain"
              />
            )}
            <div className="text-base font-semibold uppercase tracking-wide">
              {companyName}
            </div>
            <div className="text-xs text-slate-600 space-y-0.5">
              {addressLine && <div>{addressLine}</div>}
              {cityStateLine && <div>{cityStateLine}</div>}
              {contactLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              {company?.email && <div>{company.email}</div>}
            </div>
          </div>

          <div
            className={`receipt-block mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs ${payment ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
              }`}
          >
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Pedido</p>
              <p className="font-semibold">#{formatOrderNumber(order.order_number)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Data</p>
              <p className="font-semibold">{formatDate(receiptDate)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Status</p>
              <p className="font-semibold">{orderStatusLabels[order.status]}</p>
            </div>
            {payment && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Pagamento</p>
                <p className="font-semibold">{paymentStatusLabels[paymentStatus]}</p>
              </div>
            )}
          </div>

          {(order.customer || order.customer_name) && (
            <div className="receipt-block mt-4 rounded-lg border border-slate-200 p-3 text-xs space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold">{order.customer?.name || order.customer_name}</p>
              {order.customer?.document && <p>CPF/CNPJ: {order.customer.document}</p>}
              {order.customer?.phone && <p>Tel: {order.customer.phone}</p>}
              {order.customer?.email && <p>E-mail: {order.customer.email}</p>}
            </div>
          )}

          <div className="receipt-block mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="receipt-table w-full text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Produto</th>
                  <th className="px-3 py-2 text-center font-medium">Qtd</th>
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const details = [
                    item.attributes ? Object.values(item.attributes).join(', ') : '',
                    item.notes ? `Obs: ${item.notes}` : '',
                  ]
                    .filter(Boolean)
                    .join(' | ');

                  return (
                    <tr key={item.id} className="receipt-row border-t border-slate-200">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{item.product_name}</div>
                        {details && (
                          <div className="text-[10px] text-slate-500 mt-1">{details}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(Number(item.unit_price))}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(item.total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="receipt-block mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
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
                <span>Total</span>
                <span>{formatCurrency(Number(order.total))}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
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
                  <span className="text-slate-500">Valor restante</span>
                  <span className="font-medium">{formatCurrency(remaining)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Forma</span>
                <span className="font-medium">{paymentMethodLabel}</span>
              </div>
              {payment && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor deste pagamento</span>
                  <span className="font-medium">{formatCurrency(Number(payment.amount))}</span>
                </div>
              )}
            </div>
          </div>

          {order.notes && (
            <div className="receipt-block mt-4 rounded-lg border border-slate-200 p-3 text-xs space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Observações</p>
              <p className="text-slate-700">{order.notes}</p>
            </div>
          )}

          {(order.status === 'entregue' || order.status === 'aguardando_retirada' || order.status === 'finalizado' || order.status === 'pronto') && (
            <div className="receipt-block mt-12 mb-4 flex flex-col items-center gap-1">
              <div className="w-64 border-t border-slate-900"></div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Assinatura do Cliente
              </p>
              <p className="text-xs font-semibold text-slate-900 mt-1">
                {order.customer?.name || order.customer_name || 'Cliente'}
              </p>
            </div>
          )}
          <div className="receipt-block mt-5 text-center text-[11px] text-slate-500">
            <p>Documento não fiscal</p>
            <p className="mt-1">Obrigado pela preferência!</p>
          </div>
        </div>
      </div>
    );
  },
);

OrderReceipt.displayName = 'OrderReceipt';

export default OrderReceipt;
