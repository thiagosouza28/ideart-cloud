import { forwardRef } from 'react';
import { CheckCircle2, CreditCard, Mail, Phone, User } from 'lucide-react';
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

const formatDate = (d: Date) => d.toLocaleString('pt-BR');

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
      company,
      customer,
      createdAt,
    },
    ref,
  ) => {
    const customerLabel = customer?.name?.trim() || 'Consumidor final';
    const paymentLabel = paymentLabels[paymentMethod] || paymentMethod;
    const saleStatus = amountPaid >= total ? 'Pago' : amountPaid > 0 ? 'Parcial' : 'Pendente';

    return (
      <div ref={ref} className="w-full max-w-[1100px] mx-auto text-slate-900">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold">Venda confirmada!</h2>
              <p className="mt-2 text-sm text-slate-500">
                O pedido #{saleId.slice(0, 8).toUpperCase()} foi registrado com sucesso.
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

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 text-center">
              Documento não fiscal. {company?.name ? `Empresa: ${company.name}.` : ''}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold">Resumo do pedido</h3>
                  <p className="text-xs text-slate-500">{items.length} itens confirmados</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  {saleStatus.toUpperCase()}
                </span>
              </div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4 text-sm space-y-2">
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
