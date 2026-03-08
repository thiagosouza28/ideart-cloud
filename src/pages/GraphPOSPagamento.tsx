import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Banknote, Smartphone, Wallet, ChevronRight } from 'lucide-react';
import GraphPOSBreadcrumb from '@/components/graphpos/GraphPOSBreadcrumb';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario, BotaoSecundario } from '@/components/graphpos/GraphPOSButtons';
import { getGraphPOSCheckoutState, setGraphPOSCheckoutState } from '@/lib/graphposCheckout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PaymentMethod } from '@/types/database';
import { buildM2Attributes, formatAreaM2 } from '@/lib/measurements';
import { fetchCompanyPaymentMethods } from '@/services/companyPaymentMethods';
import {
  defaultCompanyPaymentMethods,
  getActiveCompanyPaymentMethods,
  type CompanyPaymentMethodConfig,
} from '@/lib/paymentMethods';
import { consumeProductSupplies } from '@/lib/supplyConsumption';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatAmountInput = (value: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const parseAmountInput = (rawValue: string) => {
  const cleaned = rawValue.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex === -1) {
    const integerDigits = cleaned.replace(/[^\d]/g, '');
    return integerDigits ? Number(integerDigits) : 0;
  }

  const integerPart = cleaned.slice(0, decimalIndex).replace(/[^\d]/g, '') || '0';
  const decimalPart = cleaned.slice(decimalIndex + 1).replace(/[^\d]/g, '').slice(0, 2);
  const normalized = decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : integerPart;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
};

const graphPosAmountInputClass =
  'mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 text-lg font-semibold text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15';

const paymentMethodIcons: Record<PaymentMethod, typeof Wallet> = {
  dinheiro: Banknote,
  cartao: CreditCard,
  credito: CreditCard,
  debito: CreditCard,
  pix: Smartphone,
  boleto: CreditCard,
  transferencia: Wallet,
  outro: Wallet,
};

export default function GraphPOSPagamento() {
  const navigate = useNavigate();
  const { user, profile, company } = useAuth();
  const { toast } = useToast();
  const checkout = useMemo(() => getGraphPOSCheckoutState(), []);
  const initialAmountPaid = checkout?.amountPaid || checkout?.total || 0;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(checkout?.paymentMethod || 'dinheiro');
  const [amountPaid, setAmountPaid] = useState(initialAmountPaid);
  const [amountPaidInput, setAmountPaidInput] = useState(() => formatAmountInput(initialAmountPaid));
  const [saving, setSaving] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CompanyPaymentMethodConfig[]>(
    getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
  );
  const draftStorageKey = 'graphpos_pdv_draft';

  const items = checkout?.items || [];
  const subtotal = checkout?.subtotal || 0;
  const discount = checkout?.discount || 0;
  const total = checkout?.total || 0;
  const change = paymentMethod === 'dinheiro' ? Math.max(0, amountPaid - total) : 0;
  const customer = checkout?.customer;
  const companyId = profile?.company_id || company?.id || null;

  useEffect(() => {
    let active = true;

    const loadPaymentMethods = async () => {
      try {
        const result = await fetchCompanyPaymentMethods({
          companyId,
          activeOnly: true,
        });
        if (!active) return;
        const resolved = result.length > 0
          ? result
          : getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods);
        setPaymentMethods(resolved);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setPaymentMethods(getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods));
      }
    };

    void loadPaymentMethods();

    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (paymentMethods.some((option) => option.type === paymentMethod)) return;
    const fallback = paymentMethods[0]?.type || 'dinheiro';
    setPaymentMethod(fallback);
  }, [paymentMethod, paymentMethods]);

  const updateAmountPaid = (value: number) => {
    setAmountPaid(value);
    setAmountPaidInput(formatAmountInput(value));
  };

  return (
    <div className="w-full bg-transparent font-sans text-foreground">
      <main className="mx-auto w-full px-auto pb-12 pt-auto">
        <GraphPOSBreadcrumb
          backLabel="Voltar para Vendas"
          backTo="/pdv"
          currentLabel="Finalizar Venda #10234"
        />

        <div className="mt-6">
          <h1 className="text-[32px] font-bold">Pagamento</h1>
          <p className="text-sm text-muted-foreground">Selecione a forma de pagamento e confirme os dados da venda.</p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <GraphPOSCard>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Dados do Cliente</p>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="text-sm font-medium text-foreground">{customer?.name || 'Consumidor Final'}</p>
                </div>
                <button
                  className="text-sm font-semibold text-primary transition hover:text-primary/80"
                  onClick={() => {
                    if (checkout) {
                      setGraphPOSCheckoutState({
                        ...checkout,
                        editingCustomer: true,
                      });
                    }
                    navigate('/pdv');
                  }}
                >
                  Alterar
                </button>
              </div>
              <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">CPF/CNPJ</p>
                  <p className="font-medium text-foreground">{customer?.document}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Telefone</p>
                  <p className="font-medium text-foreground">{customer?.phone}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">E-mail</p>
                  <p className="font-medium text-foreground">{customer?.email}</p>
                </div>
              </div>
            </GraphPOSCard>

            <GraphPOSCard>
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" />
                Forma de Pagamento
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {paymentMethods.map((option) => {
                  const Icon = paymentMethodIcons[option.type] || Wallet;
                  const selected = paymentMethod === option.type;

                  return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => setPaymentMethod(option.type)}
                    className={`flex h-20 flex-col items-center justify-center gap-2 rounded-2xl border bg-card text-sm shadow-sm transition ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/35 hover:bg-muted/40'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium">{option.name}</span>
                  </button>
                )})}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_220px]">
                <div>
                  <p className="text-sm font-semibold text-foreground">Valor Recebido (R$)</p>
                  <input
                    className={graphPosAmountInputClass}
                    value={amountPaidInput}
                    inputMode="decimal"
                    placeholder="0,00"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.,]/g, '');
                      setAmountPaidInput(raw);
                      setAmountPaid(parseAmountInput(raw));
                    }}
                    onBlur={() => setAmountPaidInput(formatAmountInput(amountPaid))}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <BotaoSecundario className="h-9 w-auto px-4 text-xs" onClick={() => updateAmountPaid(total)}>
                      Exato
                    </BotaoSecundario>
                    <BotaoSecundario className="h-9 w-auto px-4 text-xs" onClick={() => updateAmountPaid(total + 10)}>
                      + R$ 10
                    </BotaoSecundario>
                    <BotaoSecundario className="h-9 w-auto px-4 text-xs" onClick={() => updateAmountPaid(total + 50)}>
                      + R$ 50
                    </BotaoSecundario>
                  </div>
                </div>
                <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-success">
                  <p className="text-xs font-semibold uppercase">Troco a devolver</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(change)}</p>
                </div>
              </div>
            </GraphPOSCard>
          </div>

          <div className="lg:sticky lg:top-8">
            <GraphPOSSidebarResumo title="Resumo do Pedido">
              <p className="text-xs text-muted-foreground">{items.length} itens adicionados</p>
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
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {quantityLabel} x {formatCurrency(item.unitPrice)}{unitLabel}
                        </p>
                        {hasDimensions && (
                          <p className="text-[11px] text-muted-foreground">
                            {item.widthCm}cm x {item.heightCm}cm
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Desconto</span>
                  <span>- {formatCurrency(discount)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-lg font-semibold text-foreground">
                  <span>Total a Pagar</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <BotaoPrimario
                  onClick={async () => {
                    if (!checkout || items.length === 0) {
                      toast({ title: 'Carrinho vazio', variant: 'destructive' });
                      return;
                    }
                    if (!user.id) {
                      toast({ title: 'Sessao invalida. Faca login novamente.', variant: 'destructive' });
                      return;
                    }
                    if (!companyId) {
                      toast({ title: 'Empresa nao encontrada na sessao. Faca login novamente.', variant: 'destructive' });
                      return;
                    }

                    setSaving(true);
                    const payment = paymentMethod;
                    const paidAmount = payment === 'dinheiro' ? amountPaid : total;
                    const changeAmount = payment === 'dinheiro' ? Math.max(0, amountPaid - total) : 0;

                    const { data: sale, error: saleError } = await supabase
                      .from('sales')
                      .insert({
                        user_id: user.id,
                        company_id: companyId,
                        customer_id: customer?.id || null,
                        subtotal,
                        discount,
                        total,
                        payment_method: payment,
                        amount_paid: paidAmount,
                        change_amount: changeAmount,
                      })
                      .select()
                      .single();

                    if (saleError || !sale) {
                      toast({ title: 'Erro ao finalizar venda', variant: 'destructive' });
                      setSaving(false);
                      return;
                    }

                    await Promise.all(items.map((item) => {
                      const attributes = item.attributes && Object.keys(item.attributes).length > 0
                        ? item.attributes
                        : (item.widthCm && item.heightCm)
                          ? buildM2Attributes({}, {
                              widthCm: item.widthCm,
                              heightCm: item.heightCm,
                              areaM2: item.areaM2 ?? item.quantity,
                            })
                          : null;

                      return supabase.from('sale_items').insert({
                        sale_id: sale.id,
                        product_id: item.id,
                        product_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.unitPrice,
                        discount: 0,
                        total: item.unitPrice * item.quantity,
                        attributes,
                      });
                    }));

                    const quantitiesByProduct: Record<string, number> = {};
                    items.forEach((item) => {
                      quantitiesByProduct[item.id] = (quantitiesByProduct[item.id] || 0) + item.quantity;
                    });
                    const productIds = Object.keys(quantitiesByProduct);
                    let productsStockQuery = supabase
                      .from('products')
                      .select('id, track_stock, stock_quantity')
                      .in('id', productIds);
                    if (companyId) {
                      productsStockQuery = productsStockQuery.eq('company_id', companyId);
                    }
                    const { data: productsData } = await productsStockQuery;

                    const trackedProducts = (productsData || []).filter((p) => p.track_stock);
                    if (trackedProducts.length > 0) {
                      await Promise.all(trackedProducts.map((product) => {
                        const qty = quantitiesByProduct[product.id] || 0;
                        if (qty <= 0) return Promise.resolve();
                        const newStock = Number(product.stock_quantity) - qty;
                        let updateProductQuery = supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id);
                        if (companyId) {
                          updateProductQuery = updateProductQuery.eq('company_id', companyId);
                        }
                        return updateProductQuery;
                      }));

                      await Promise.all(trackedProducts.map((product) => {
                        const qty = quantitiesByProduct[product.id] || 0;
                        if (qty <= 0) return Promise.resolve();
                        return supabase.from('stock_movements').insert({
                          product_id: product.id,
                          movement_type: 'saida',
                          quantity: qty,
                          reason: `Venda PDV #${sale.id.slice(0, 8)}`,
                          user_id: user.id,
                        });
                      }));
                    }

                    await consumeProductSupplies({
                      companyId,
                      saleId: sale.id,
                      userId: user.id,
                      items: items.map((item) => ({
                        product_id: item.id,
                        product_name: item.name,
                        quantity: item.quantity,
                      })),
                    });

                    await supabase.rpc('recalculate_product_sales_counts', {
                      p_company_id: companyId,
                    });

                    setGraphPOSCheckoutState({
                      ...checkout,
                      paymentMethod,
                      amountPaid,
                      saleId: sale.id,
                      createdAt: sale.created_at,
                    });
                    window.localStorage.removeItem(draftStorageKey);

                    setSaving(false);
                    navigate('/confirmacao');
                  }}
                  disabled={saving}
                >
                  <span className="flex items-center justify-center gap-2">
                    {saving ? 'Confirmando...' : 'Confirmar Pagamento'}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </BotaoPrimario>
                <button className="w-full text-xs font-semibold text-destructive transition hover:text-destructive/80">Cancelar Venda</button>
              </div>
            </GraphPOSSidebarResumo>
          </div>
        </div>
      </main>
    </div>
  );
}
