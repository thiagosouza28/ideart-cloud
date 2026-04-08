import { forwardRef } from 'react';
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);

const paymentLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  credito: 'Cartão crédito',
  debito: 'Cartão débito',
  transferencia: 'Transferência',
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
    const issueDate = createdAt || new Date();
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
              <span>{formatDate(issueDate)}</span>
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
              const isM2 = item.unitLabel === 'm²' || Boolean(item.areaM2) || Boolean(item.widthCm && item.heightCm);
              const quantityLabel = isM2 ? `${formatAreaM2(item.quantity)} m²` : `${item.quantity} un`;
              const unitSuffix = isM2 ? ' / m²' : '';
              const hasDimensions = Boolean(item.widthCm && item.heightCm);

              return (
                <div key={`${item.name}-${index}`} className="space-y-1">
                  <p className="font-semibold uppercase">{item.name}</p>
                  <p>
                    {quantityLabel} x {formatCurrency(item.unitPrice)}
                    {unitSuffix}
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
            <p>Obrigado pela preferência!</p>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="receipt-root receipt-fixed-width mx-auto shrink-0 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm"
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
                  <p className="text-lg font-semibold leading-tight">{company?.name || 'Comprovante de venda'}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Comprovante de pagamento</p>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                {company?.address && <p>Endereço: {company.address}</p>}
                {(company?.city || company?.state) && <p>Cidade/UF: {[company?.city, company?.state].filter(Boolean).join(' - ')}</p>}
                {company?.phone && <p>Tel: {company.phone}</p>}
                {company?.whatsapp && company.whatsapp !== company.phone && <p>WhatsApp: {company.whatsapp}</p>}
                {company?.email && <p>{company.email}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-[11px]">
              <p className="uppercase tracking-wide text-slate-500">Venda</p>
              <p className="text-sm font-semibold">#{saleNumber}</p>
              <p className="mt-1 uppercase tracking-wide text-slate-500">Emitido em</p>
              <p className="font-medium">{formatDate(issueDate)}</p>
            </div>
          </div>
        </div>

        <div className="receipt-block mt-4 grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
          <div>
            <p className="uppercase tracking-wide text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-900">{customerLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Status</p>
            <p className="font-semibold text-slate-900">{saleStatus}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Pagamento</p>
            <p className="font-semibold text-slate-900">{paymentLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500">Total</p>
            <p className="font-semibold text-slate-900">{formatCurrency(total)}</p>
          </div>
        </div>

        <div className="receipt-block mt-4 rounded-lg border border-slate-200 px-3 py-2 text-[11px]">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-900">{customerLabel}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Documento</p>
              <p className="font-medium text-slate-700">{customer?.document || '-'}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Contato</p>
              <p className="font-medium text-slate-700">{customer?.phone || customer?.email || '-'}</p>
            </div>
          </div>
        </div>

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
              {items.map((item, index) => {
                const isM2 = item.unitLabel === 'm²' || Boolean(item.areaM2) || Boolean(item.widthCm && item.heightCm);
                const quantityLabel = isM2 ? `${formatAreaM2(item.quantity)} m²` : item.quantity;
                const unitSuffix = isM2 ? ' / m²' : '';
                const hasDimensions = Boolean(item.widthCm && item.heightCm);
                const details = hasDimensions ? `${item.widthCm}cm x ${item.heightCm}cm` : '';

                return (
                  <tr key={`${item.name}-${index}`} className="receipt-row border-t border-slate-200">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{item.name}</div>
                      {details && <div className="mt-1 text-[10px] text-slate-500">{details}</div>}
                    </td>
                    <td className="px-3 py-2 text-center align-top">{quantityLabel}</td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatCurrency(item.unitPrice)}
                      {unitSuffix}
                    </td>
                    <td className="px-3 py-2 text-right font-medium align-top">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="receipt-block mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Desconto</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                <span>Total da venda</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Status do pagamento</span>
                <span className="font-medium">{saleStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Forma</span>
                <span className="font-medium">{paymentLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor recebido</span>
                <span className="font-medium">{formatCurrency(amountPaid)}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Troco</span>
                  <span className="font-medium">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="receipt-block mt-6 grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center rounded-lg border border-slate-200 p-3 text-center text-[11px]">
            <p className="w-full text-[10px] uppercase tracking-wide text-slate-500">Assinatura da loja</p>
            <div className="mt-2 flex min-h-[64px] w-full items-end justify-center">
              <div className="w-full max-w-[220px] border-b border-dashed border-slate-300" />
            </div>
            <p className="mt-2 text-center text-sm font-medium italic text-slate-900">{company?.name || 'Loja'}</p>
          </div>

          <div className="flex flex-col items-center rounded-lg border border-slate-200 p-3 text-center text-[11px]">
            <p className="w-full text-[10px] uppercase tracking-wide text-slate-500">Assinatura do cliente</p>
            <div className="mt-2 flex min-h-[64px] w-full items-end justify-center">
              <div className="w-full max-w-[220px] border-b border-dashed border-slate-300" />
            </div>
            <p className="mt-2 text-center text-sm font-medium text-slate-900">{customerLabel}</p>
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

SaleReceipt.displayName = 'SaleReceipt';

export default SaleReceipt;
