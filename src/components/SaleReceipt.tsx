import { forwardRef } from 'react';
import { CheckCircle2, CreditCard, Mail, Phone, User } from 'lucide-react';
import { PaymentMethod } from '@/types/database';
import { formatAreaM2 } from '@/lib/measurements';

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
  widthCm?: number;
  heightCm?: number;
  areaM2?: number;
}

export type SaleReceiptLayout = 'a4' | 'thermal80' | 'thermal58';

export interface SaleReceiptCustomer {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface SaleReceiptProps {
  saleId: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  change: number;
  layout?: SaleReceiptLayout;
  company?: {
    name: string;
    logo_url?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  customer?: SaleReceiptCustomer | null;
  createdAt?: Date;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);

const paymentLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  pix: 'PIX',
  boleto: 'Boleto',
  outro: 'Outro',
};

const SaleReceipt = forwardRef<HTMLDivElement, SaleReceiptProps>(
  (
    {
      saleId,
      items,
      subtotal,
      discount,
      total,
      paymentMethod,
      amountPaid,
      change,
      layout = 'a4',
      company,
      customer,
      createdAt,
    },
    ref,
  ) => {
    const customerLabel = customer?.name?.trim() || 'Consumidor final';
    const paymentLabel = paymentLabels[paymentMethod] || paymentMethod;
    const saleStatus = amountPaid >= total ? 'Pago' : amountPaid > 0 ? 'Parcial' : 'Pendente';
    const saleNumber = saleId.slice(0, 8).toUpperCase();
    const isThermal = layout === 'thermal80' || layout === 'thermal58';

    if (isThermal) {
      const widthClass = layout === 'thermal58' ? 'w-[58mm]' : 'w-[80mm]';

      return (
        <div ref={ref} className={`${widthClass} mx-auto bg-white p-3 font-mono text-[11px] leading-4 text-slate-900`}>
          <div className="border-b border-dashed border-slate-300 pb-2 text-center">
            <p className="text-sm font-bold uppercase">{company?.name || 'Comprovante de venda'}</p>
            {company?.phone && <p>{company.phone}</p>}
            {company?.address && <p>{company.address}</p>}
            {(company?.city || company?.state) && (
              <p>{[company?.city, company?.state].filter(Boolean).join(' - ')}</p>
            )}
          </div>

          <div className="space-y-1 border-b border-dashed border-slate-300 py-2">
            <div className="flex items-center justify-between gap-2">
              <span>Pedido</span>
              <span className="font-semibold">#{saleNumber}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Data</span>
              <span>{formatDate(createdAt || new Date())}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              <span className="font-semibold">{saleStatus}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Pagamento</span>
              <span>{paymentLabel}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-300 py-2">
            <p className="font-semibold">{customerLabel}</p>
            {customer?.document && <p>Doc: {customer.document}</p>}
            {customer?.phone && <p>Fone: {customer.phone}</p>}
            {customer?.email && <p>E-mail: {customer.email}</p>}
          </div>

          <div className="space-y-2 border-b border-dashed border-slate-300 py-2">
            {items.length === 0 && <p>Sem itens no pedido.</p>}
            {items.map((item, index) => {
              const isM2 = item.unitLabel === 'm\u00B2' || Boolean(item.areaM2) || (item.widthCm && item.heightCm);
              const quantityLabel = isM2 ? `${formatAreaM2(item.quantity)} m\u00B2` : `${item.quantity} un`;
              const unitSuffix = isM2 ? ' / m\u00B2' : '';
              const hasDimensions = Boolean(item.widthCm && item.heightCm);

              return (
                <div key={`${item.name}-${index}`} className="space-y-1">
                  <p className="font-semibold uppercase">{item.name}</p>
                  <p>
                    {quantityLabel} x {formatCurrency(item.unitPrice)}{unitSuffix}
                  </p>
                  {hasDimensions && (
                    <p>
                      {item.widthCm}cm x {item.heightCm}cm
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span>Total item</span>
                    <span className="font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1 border-b border-dashed border-slate-300 py-2">
            <div className="flex items-center justify-between gap-2">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Desconto</span>
              <span>- {formatCurrency(discount || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Total</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Valor recebido</span>
              <span>{formatCurrency(amountPaid)}</span>
            </div>
            {change > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span>Troco</span>
                <span>{formatCurrency(change)}</span>
              </div>
            )}
          </div>

          <div className="pt-2 text-center">
            <p className="font-semibold uppercase">Documento não fiscal</p>
            <p>Obrigado pela preferencia!</p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className="mx-auto w-full max-w-[1100px] text-slate-900">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold">Venda confirmada!</h2>
              <p className="mt-2 text-sm text-slate-500">
                O pedido #{saleNumber} foi registrado com sucesso.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
                <span>Data: {formatDate(createdAt || new Date())}</span>
                <span>|</span>
                <span>Status: {saleStatus}</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Dados do cliente</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{customerLabel}</span>
                  </div>
                  {customer?.email && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="h-4 w-4" />
                      {customer.email}
                    </div>
                  )}
                  {customer?.phone && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="h-4 w-4" />
                      {customer.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Detalhes do pagamento</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{paymentLabel}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Valor recebido</span>
                    <span className="font-medium text-slate-700">{formatCurrency(amountPaid)}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Troco</span>
                      <span className="font-semibold">{formatCurrency(change)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
              Documento não fiscal. {company?.name ? `Empresa: ${company.name}.` : ''}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Resumo do pedido</h3>
                  <p className="text-xs text-slate-500">{items.length} itens confirmados</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  {saleStatus.toUpperCase()}
                </span>
              </div>
              <div className="space-y-3">
                {items.map((item, index) => {
                  const isM2 = item.unitLabel === 'm\u00B2' || Boolean(item.areaM2) || (item.widthCm && item.heightCm);
                  const quantityLabel = isM2 ? `${formatAreaM2(item.quantity)} m\u00B2` : String(item.quantity);
                  const unitSuffix = isM2 ? ' / m\u00B2' : '';
                  const hasDimensions = Boolean(item.widthCm && item.heightCm);

                  return (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          {quantityLabel} x {formatCurrency(item.unitPrice)}{unitSuffix}
                        </p>
                        {hasDimensions && (
                          <p className="text-[11px] text-slate-400">
                            {item.widthCm}cm x {item.heightCm}cm
                          </p>
                        )}
                      </div>
                      <span className="font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Desconto</span>
                  <span>- {formatCurrency(discount || 0)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total pago</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

SaleReceipt.displayName = 'SaleReceipt';

export default SaleReceipt;
