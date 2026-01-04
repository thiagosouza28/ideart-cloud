import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Mail, Printer, User, Phone, CreditCard } from 'lucide-react';
import GraphPOSBreadcrumb from '@/components/graphpos/GraphPOSBreadcrumb';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario, BotaoSecundario } from '@/components/graphpos/GraphPOSButtons';
import { clearGraphPOSCheckoutState, getGraphPOSCheckoutState } from '@/lib/graphposCheckout';
import SaleReceipt from '@/components/SaleReceipt';
import { Customer, PaymentMethod } from '@/types/database';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function GraphPOSConfirmacao() {
  const navigate = useNavigate();
  // Keep mock navigation consistent with the demo flow.
  const checkout = useMemo(() => getGraphPOSCheckoutState(), []);
  const receiptRef = useRef<HTMLDivElement>(null);
  const items = checkout?.items || [];
  const subtotal = checkout?.subtotal || 0;
  const discount = checkout?.discount || 0;
  const total = checkout?.total || 0;
  const amountPaid = checkout?.amountPaid || total;
  const customer = checkout?.customer;
  const paymentLabel = checkout?.paymentMethod || 'dinheiro';
  const saleId = checkout?.saleId || '00000000';
  const createdAt = checkout?.createdAt ? new Date(checkout.createdAt) : new Date();
  const paymentLabelMap: Record<string, string> = {
    dinheiro: 'Dinheiro',
    credito: 'Credito',
    debito: 'Debito',
    pix: 'Pix',
    outros: 'Outros',
  };
  const receiptPaymentMethod: PaymentMethod = paymentLabel === 'pix'
    ? 'pix'
    : paymentLabel === 'dinheiro'
      ? 'dinheiro'
      : paymentLabel === 'outros'
        ? 'outro'
        : 'cartao';

  const receiptCustomer: Customer | null = customer
    ? {
        id: customer.id,
        name: customer.name,
        document: customer.document || null,
        email: customer.email || null,
        phone: customer.phone || null,
        address: null,
        city: null,
        state: null,
        zip_code: null,
        notes: null,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      }
    : null;

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printContent = receiptRef.current.innerHTML;
    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo</title>
          ${styles}
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  return (
    <div className="w-full bg-transparent font-sans text-slate-900">
      <main className="mx-auto w-full px-auto pb-12 pt-auto">
        <GraphPOSBreadcrumb
          backLabel="Voltar para Vendas"
          backTo="/pdv"
          currentLabel="Confirmação de Pedido"
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <GraphPOSCard className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <h1 className="mt-5 text-[32px] font-bold">Venda Confirmada!</h1>
              <p className="mt-2 text-sm text-slate-500">
                O pedido #10234 foi processado e registrado no sistema com sucesso.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <BotaoSecundario className="w-auto px-6" onClick={handlePrint}>
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Imprimir Recibo
                  </span>
                </BotaoSecundario>
                <BotaoSecundario className="w-auto px-6">
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Enviar por e-mail
                  </span>
                </BotaoSecundario>
              </div>
            </GraphPOSCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <GraphPOSCard>
                <p className="text-xs font-semibold uppercase text-slate-400">Dados do Cliente</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-slate-800">{customer?.name || 'Joao Silva'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span>{customer?.email || 'joao.silva@email.com'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{customer?.phone || '(11) 98765-4321'}</span>
                  </div>
                </div>
              </GraphPOSCard>

              <GraphPOSCard>
                <p className="text-xs font-semibold uppercase text-slate-400">Detalhes do Pagamento</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-slate-800">{paymentLabelMap[paymentLabel] || 'Dinheiro'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Valor Recebido</span>
                    <span className="font-semibold text-slate-800">{formatCurrency(amountPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Troco</span>
                    <span className="font-semibold">{formatCurrency(Math.max(0, amountPaid - total))}</span>
                  </div>
                </div>
              </GraphPOSCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <BotaoSecundario onClick={() => navigate('/dashboard')} className="h-14 text-base">
                Voltar ao Dashboard
              </BotaoSecundario>
              <BotaoPrimario
                onClick={() => {
                  clearGraphPOSCheckoutState();
                  navigate('/pdv');
                }}
                className="h-14 text-base"
              >
                Iniciar Nova Venda
              </BotaoPrimario>
            </div>
          </div>

          <div className="lg:sticky lg:top-8">
            <GraphPOSSidebarResumo title="Resumo do Pedido" badge="PAGO">
              <p className="text-xs text-slate-500">{items.length} itens confirmados</p>
              <div className="mt-4 space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} un x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Desconto</span>
                  <span>- {formatCurrency(discount)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-lg font-semibold text-slate-900">
                  <span>Total Pago</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </GraphPOSSidebarResumo>
          </div>
        </div>

        <div className="sr-only">
          <SaleReceipt
            ref={receiptRef}
            saleId={saleId}
            items={items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            }))}
            subtotal={subtotal}
            discount={discount}
            total={total}
            paymentMethod={receiptPaymentMethod}
            amountPaid={amountPaid}
            change={Math.max(0, amountPaid - total)}
            customer={receiptCustomer}
            createdAt={createdAt}
          />
        </div>
      </main>
    </div>
  );
}
