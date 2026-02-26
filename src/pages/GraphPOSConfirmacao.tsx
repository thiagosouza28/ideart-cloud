import { RefObject, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CreditCard, Phone, Printer, User } from 'lucide-react';
import GraphPOSBreadcrumb from '@/components/graphpos/GraphPOSBreadcrumb';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario, BotaoSecundario } from '@/components/graphpos/GraphPOSButtons';
import { clearGraphPOSCheckoutState, getGraphPOSCheckoutState } from '@/lib/graphposCheckout';
import SaleReceipt, { SaleReceiptCustomer, SaleReceiptLayout } from '@/components/SaleReceipt';
import { PaymentMethod } from '@/types/database';
import { formatAreaM2 } from '@/lib/measurements';
import { useAuth } from '@/contexts/AuthContext';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function GraphPOSConfirmacao() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const checkout = useMemo(() => getGraphPOSCheckoutState(), []);

  const receiptA4Ref = useRef<HTMLDivElement>(null);
  const receipt80Ref = useRef<HTMLDivElement>(null);
  const receipt58Ref = useRef<HTMLDivElement>(null);

  const items = checkout?.items || [];
  const subtotal = checkout?.subtotal || 0;
  const discount = checkout?.discount || 0;
  const total = checkout?.total || 0;
  const amountPaid = checkout?.amountPaid || total;
  const customer = checkout?.customer;
  const paymentLabel = checkout?.paymentMethod || 'dinheiro';
  const saleId = checkout?.saleId || '00000000';
  const createdAt = checkout?.createdAt ? new Date(checkout.createdAt) : new Date();

  const hasCheckoutCustomer = Boolean(customer?.name?.trim());
  const [useRealCustomer, setUseRealCustomer] = useState(hasCheckoutCustomer);
  const [customerForm, setCustomerForm] = useState({
    name: customer?.name || '',
    document: customer?.document || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
  });

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

  const receiptCustomer: SaleReceiptCustomer = useMemo(() => {
    if (!useRealCustomer || !hasCheckoutCustomer) {
      return {
        name: 'Consumidor final',
        document: null,
        email: null,
        phone: null,
      };
    }

    const normalizedName = customerForm.name.trim() || 'Consumidor final';

    return {
      name: normalizedName,
      document: customerForm.document.trim() || null,
      email: customerForm.email.trim() || null,
      phone: customerForm.phone.trim() || null,
    };
  }, [customerForm.document, customerForm.email, customerForm.name, customerForm.phone, hasCheckoutCustomer, useRealCustomer]);

  const handleCustomerField = (field: keyof typeof customerForm, value: string) => {
    setCustomerForm((prev) => ({ ...prev, [field]: value }));
  };

  const printConfigs: Record<SaleReceiptLayout, {
    ref: RefObject<HTMLDivElement>;
    title: string;
    pageStyle: string;
    windowFeatures: string;
  }> = {
    a4: {
      ref: receiptA4Ref,
      title: 'Recibo A4',
      windowFeatures: 'width=1000,height=900',
      pageStyle: `
        @page { size: A4 portrait; margin: 12mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `,
    },
    thermal80: {
      ref: receipt80Ref,
      title: 'Cupom Não Fiscal 80mm',
      windowFeatures: 'width=520,height=900',
      pageStyle: `
        @page { size: 80mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `,
    },
    thermal58: {
      ref: receipt58Ref,
      title: 'Cupom Não Fiscal 58mm',
      windowFeatures: 'width=420,height=900',
      pageStyle: `
        @page { size: 58mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `,
    },
  };

  const handlePrint = (layout: SaleReceiptLayout) => {
    const config = printConfigs[layout];
    const receiptNode = config.ref.current;
    if (!receiptNode) return;

    const printContent = receiptNode.outerHTML;
    const printWindow = window.open('', '', config.windowFeatures);
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>${config.title}</title>
          ${styles}
          <style>${config.pageStyle}</style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
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
                O pedido #{saleId.slice(0, 8).toUpperCase()} foi processado e registrado com sucesso.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <BotaoSecundario className="h-11 w-auto px-5" onClick={() => handlePrint('a4')}>
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Imprimir A4
                  </span>
                </BotaoSecundario>
                <BotaoSecundario className="h-11 w-auto px-5" onClick={() => handlePrint('thermal80')}>
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Cupom 80mm
                  </span>
                </BotaoSecundario>
                <BotaoSecundario className="h-11 w-auto px-5" onClick={() => handlePrint('thermal58')}>
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Cupom 58mm
                  </span>
                </BotaoSecundario>
              </div>
            </GraphPOSCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <GraphPOSCard>
                <p className="text-xs font-semibold uppercase text-slate-400">Cliente no recibo</p>

                {hasCheckoutCustomer ? (
                  <>
                    <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={useRealCustomer}
                        onChange={(e) => setUseRealCustomer(e.target.checked)}
                      />
                      Usar cliente real da venda
                    </label>

                    {useRealCustomer ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          Nome
                          <input
                            className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                            value={customerForm.name}
                            onChange={(e) => handleCustomerField('name', e.target.value)}
                            placeholder="Nome do cliente"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          CPF/CNPJ
                          <input
                            className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                            value={customerForm.document}
                            onChange={(e) => handleCustomerField('document', e.target.value)}
                            placeholder="Documento"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          Telefone
                          <input
                            className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                            value={customerForm.phone}
                            onChange={(e) => handleCustomerField('phone', e.target.value)}
                            placeholder="Telefone"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          E-mail
                          <input
                            className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                            value={customerForm.email}
                            onChange={(e) => handleCustomerField('email', e.target.value)}
                            placeholder="E-mail"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        O recibo sera emitido como <span className="font-semibold">Consumidor final</span>.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Nenhum cliente selecionado na venda. O recibo sera emitido como <span className="font-semibold">Consumidor final</span>.
                  </div>
                )}
              </GraphPOSCard>

              <GraphPOSCard>
                <p className="text-xs font-semibold uppercase text-slate-400">Detalhes do pagamento</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-slate-800">{receiptCustomer.name}</span>
                  </div>
                  {receiptCustomer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{receiptCustomer.phone}</span>
                    </div>
                  )}
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
                {items.map((item, index) => {
                  const isM2 = item.unitLabel === 'm\u00B2' || Boolean(item.areaM2) || (item.widthCm && item.heightCm);
                  const quantityLabel = isM2
                    ? `${formatAreaM2(item.quantity)} m\u00B2`
                    : `${item.quantity} un`;
                  const unitLabel = isM2 ? '/ m\u00B2' : '';
                  const hasDimensions = Boolean(item.widthCm && item.heightCm);

                  return (
                    <div key={`${item.id}-${index}`} className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {quantityLabel} x {formatCurrency(item.unitPrice)}{unitLabel}
                        </p>
                        {hasDimensions && (
                          <p className="text-[11px] text-slate-400">
                            {item.widthCm}cm x {item.heightCm}cm
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  );
                })}
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

        <div className="sr-only" aria-hidden="true">
          <SaleReceipt
            ref={receiptA4Ref}
            layout="a4"
            saleId={saleId}
            items={items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitLabel: item.unitLabel,
              widthCm: item.widthCm,
              heightCm: item.heightCm,
              areaM2: item.areaM2,
            }))}
            subtotal={subtotal}
            discount={discount}
            total={total}
            paymentMethod={receiptPaymentMethod}
            amountPaid={amountPaid}
            change={Math.max(0, amountPaid - total)}
            company={company}
            customer={receiptCustomer}
            createdAt={createdAt}
          />
          <SaleReceipt
            ref={receipt80Ref}
            layout="thermal80"
            saleId={saleId}
            items={items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitLabel: item.unitLabel,
              widthCm: item.widthCm,
              heightCm: item.heightCm,
              areaM2: item.areaM2,
            }))}
            subtotal={subtotal}
            discount={discount}
            total={total}
            paymentMethod={receiptPaymentMethod}
            amountPaid={amountPaid}
            change={Math.max(0, amountPaid - total)}
            company={company}
            customer={receiptCustomer}
            createdAt={createdAt}
          />
          <SaleReceipt
            ref={receipt58Ref}
            layout="thermal58"
            saleId={saleId}
            items={items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitLabel: item.unitLabel,
              widthCm: item.widthCm,
              heightCm: item.heightCm,
              areaM2: item.areaM2,
            }))}
            subtotal={subtotal}
            discount={discount}
            total={total}
            paymentMethod={receiptPaymentMethod}
            amountPaid={amountPaid}
            change={Math.max(0, amountPaid - total)}
            company={company}
            customer={receiptCustomer}
            createdAt={createdAt}
          />
        </div>
      </main>
    </div>
  );
}
