import { useMemo, useState } from 'react';
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

export default function GraphPOSPagamento() {
  const navigate = useNavigate();
  const { user, profile, company } = useAuth();
  const { toast } = useToast();
  // Keep navigation flow aligned with the 3-screen demo.
  const checkout = useMemo(() => getGraphPOSCheckoutState(), []);
  const initialAmountPaid = checkout?.amountPaid || checkout?.total || 0;
  const [paymentMethod, setPaymentMethod] = useState(
    checkout?.paymentMethod || 'dinheiro',
  );
  const [amountPaid, setAmountPaid] = useState(initialAmountPaid);
  const [amountPaidInput, setAmountPaidInput] = useState(() => formatAmountInput(initialAmountPaid));
  const [saving, setSaving] = useState(false);
  const draftStorageKey = 'graphpos_pdv_draft';

  const items = checkout?.items || [];
  const subtotal = checkout?.subtotal || 0;
  const discount = checkout?.discount || 0;
  const total = checkout?.total || 0;
  const change = paymentMethod === 'dinheiro' ? Math.max(0, amountPaid - total) : 0;
  const customer = checkout?.customer;
  const companyId = profile?.company_id || company?.id || null;

  const mapPaymentMethod = (): PaymentMethod => {
    if (paymentMethod === 'dinheiro') return 'dinheiro';
    if (paymentMethod === 'pix') return 'pix';
    if (paymentMethod === 'outros') return 'outro';
    return 'cartao';
  };

  const updateAmountPaid = (value: number) => {
    setAmountPaid(value);
    setAmountPaidInput(formatAmountInput(value));
  };

  return (
    <div className="w-full bg-transparent font-sans text-slate-900">
      <main className="mx-auto w-full px-auto pb-12 pt-auto">
        <GraphPOSBreadcrumb
          backLabel="Voltar para Vendas"
          backTo="/pdv"
          currentLabel="Finalizar Venda #10234"
        />

        <div className="mt-6">
          <h1 className="text-[32px] font-bold">Pagamento</h1>
          <p className="text-sm text-slate-500">Selecione a forma de pagamento e confirme os dados da venda.</p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <GraphPOSCard>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Dados do Cliente</p>
                  <p className="text-xs text-slate-400">Nome</p>
                  <p className="text-sm font-medium text-slate-700">{customer?.name || 'Consumidor Final'}</p>
                </div>
                <button
                  className="text-sm font-semibold text-sky-600"
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
              <div className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-slate-400">CPF/CNPJ</p>
                  <p className="font-medium text-slate-700">{customer?.document}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Telefone</p>
                  <p className="font-medium text-slate-700">{customer?.phone}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">E-mail</p>
                  <p className="font-medium text-slate-700">{customer?.email}</p>
                </div>
              </div>
            </GraphPOSCard>

            <GraphPOSCard>
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Wallet className="h-4 w-4 text-sky-500" />
                Forma de Pagamento
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  { label: 'Dinheiro', icon: Banknote },
                  { label: 'Credito', icon: CreditCard },
                  { label: 'Debito', icon: CreditCard },
                  { label: 'Pix', icon: Smartphone },
                  { label: 'Outros', icon: Wallet },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      const value = option.label.toLowerCase();
                      const map: Record<string, typeof paymentMethod> = {
                        dinheiro: 'dinheiro',
                        credito: 'credito',
                        debito: 'debito',
                        pix: 'pix',
                        outros: 'outros',
                      };
                      setPaymentMethod(map[value] || 'dinheiro');
                    }}
                    className={`flex h-20 flex-col items-center justify-center gap-2 rounded-2xl border bg-white text-sm shadow-sm hover:border-sky-300 ${
                      paymentMethod === option.label.toLowerCase()
                        ? 'border-sky-400 text-sky-600'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <option.icon className="h-5 w-5 text-sky-500" />
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_220px]">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Valor Recebido (R$)</p>
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-900"
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
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700">
                  <p className="text-xs font-semibold uppercase">Troco a devolver</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(change)}</p>
                </div>
              </div>
            </GraphPOSCard>
          </div>

          <div className="lg:sticky lg:top-8">
            <GraphPOSSidebarResumo title="Resumo do Pedido">
              <p className="text-xs text-slate-500">{items.length} itens adicionados</p>
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
                    if (!user?.id) {
                      toast({ title: 'Sessão inválida. Faça login novamente.', variant: 'destructive' });
                      return;
                    }
                    if (!companyId) {
                      toast({ title: 'Empresa não encontrada na sessão. Faça login novamente.', variant: 'destructive' });
                      return;
                    }

                    setSaving(true);
                    const payment = mapPaymentMethod();
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

                    const { data: productSupplies } = await supabase
                      .from('product_supplies')
                      .select('product_id, supply_id, quantity')
                      .in('product_id', productIds);

                    if (productSupplies && productSupplies.length > 0) {
                      const usageBySupply: Record<string, number> = {};

                      productSupplies.forEach((ps: any) => {
                        const qty = quantitiesByProduct[ps.product_id];
                        if (!qty) return;
                        const usage = Number(ps.quantity) * qty;
                        if (usage <= 0) return;
                        usageBySupply[ps.supply_id] = (usageBySupply[ps.supply_id] || 0) + usage;
                      });

                      const supplyIds = Object.keys(usageBySupply);
                      if (supplyIds.length > 0) {
                        const { data: suppliesData } = await supabase
                          .from('supplies')
                          .select('id, stock_quantity')
                          .in('id', supplyIds);

                        if (suppliesData && suppliesData.length > 0) {
                          await Promise.all(suppliesData.map((supply: any) => {
                            const usage = usageBySupply[supply.id] || 0;
                            const newStock = Number(supply.stock_quantity) - usage;
                            return supabase.from('supplies').update({ stock_quantity: newStock }).eq('id', supply.id);
                          }));
                        }
                      }
                    }

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
                <button className="w-full text-xs font-semibold text-red-500">Cancelar Venda</button>
              </div>
            </GraphPOSSidebarResumo>
          </div>
        </div>
      </main>
    </div>
  );
}

