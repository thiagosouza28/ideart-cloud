import { forwardRef } from 'react';
import { PaymentMethod, Customer } from '@/types/database';

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
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
  customer?: Customer | null;
  createdAt?: Date;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d: Date) =>
  d.toLocaleString('pt-BR');

const paymentLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  pix: 'PIX',
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
      company,
      customer,
      createdAt,
    },
    ref,
  ) => {
    const customerLabel = customer?.name?.trim() || 'Consumidor final';
    const companyName = company?.name || 'Comprovante de Venda';
    const addressLine = company?.address ? `Endereço: ${company.address}` : '';
    const cityState = [company?.city, company?.state].filter(Boolean).join(' - ');
    const cityStateLine = cityState ? `Cidade/UF: ${cityState}` : '';
    const contactLines: string[] = [];
    const totalLabel = formatCurrency(total);
    const saleStatus =
      amountPaid >= total ? 'Pago' : amountPaid > 0 ? 'Parcial' : 'Pendente';

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
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Venda</p>
              <p className="font-semibold">#{saleId.slice(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold">{customerLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Status</p>
              <p className="font-semibold">{saleStatus}</p>
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

          <div className="receipt-block mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Venda</p>
              <p className="font-semibold">#{saleId.slice(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Data</p>
              <p className="font-semibold">{formatDate(createdAt || new Date())}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="font-semibold">{customerLabel}</p>
            </div>
          </div>

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
                {items.map((item, index) => (
                  <tr key={index} className="receipt-row border-t border-slate-200">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{item.name}</div>
                    </td>
                    <td className="px-3 py-2 text-center">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="receipt-block mt-4 grid gap-3 sm:grid-cols-[1.1fr_1fr]">
            <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Forma de pagamento</span>
                <span className="font-medium">{paymentLabels[paymentMethod]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor pago</span>
                <span className="font-medium">{formatCurrency(amountPaid)}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Troco</span>
                  <span className="font-medium">{formatCurrency(change)}</span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
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
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="receipt-block mt-5 text-center text-[11px] text-slate-500">
            <p>Documento não fiscal</p>
            <p className="mt-1">Obrigado pela preferência!</p>
          </div>
        </div>
      </div>
    );
  },
);

SaleReceipt.displayName = 'SaleReceipt';

export default SaleReceipt;
