import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Barcode,
  Printer,
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { Product, CartItem, PaymentMethod, Company, Customer } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import SaleReceipt from '@/components/SaleReceipt';
import CustomerSearch from '@/components/CustomerSearch';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveSuggestedPrice } from '@/lib/pricing';

export default function PDV() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [lastSale, setLastSale] = useState<{
    id: string;
    items: CartItem[];
    subtotal: number;
    discount: number;
    total: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
    change: number;
    createdAt: Date;
    customer?: Customer | null;
  } | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.company_id) {
      supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCompany({
              ...(data as Company),
              logo_url: ensurePublicStorageUrl('product-images', data.logo_url),
            });
          }
        });
    }
  }, [profile?.company_id]);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setProductsLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
        .order('name')
        .limit(20);

      if (error) {
        toast({ title: 'Erro ao buscar produtos', variant: 'destructive' });
        setProducts([]);
        setProductsLoading(false);
        return;
      }

      const mapped = (data as Product[] || []).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));
      setProducts(mapped);
      setProductsLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, toast]);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const code = barcodeInput.trim();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('sku', code)
      .maybeSingle();

    if (error || !data) {
      toast({ title: 'Produto não encontrado', description: `Código: ${barcodeInput}`, variant: 'destructive' });
      barcodeInputRef.current?.focus();
      return;
    }

    const mapped = {
      ...(data as Product),
      image_url: ensurePublicStorageUrl('product-images', data.image_url),
    };
    addToCart(mapped);
    setBarcodeInput('');
    toast({ title: `${mapped.name} adicionado` });
    barcodeInputRef.current?.focus();
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(i => i.product.id === product.id);
    if (existing) {
      setCart(cart.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          unit_price: getUnitPrice(product),
          discount: 0,
          attributes: {},
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(i => {
      if (i.product.id === productId) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(i => i.product.id !== productId));

  const subtotal = cart.reduce((acc, i) => acc + (i.unit_price * i.quantity - i.discount), 0);
  const total = subtotal - discount;
  const change = paymentMethod === 'dinheiro' ? Math.max(0, parseFloat(amountPaid || '0') - total) : 0;

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const getUnitPrice = (product: Product) => resolveSuggestedPrice(product, 1, [], 0);

  const handleFinalizeSale = () => {
    if (cart.length === 0) return toast({ title: 'Carrinho vazio', variant: 'destructive' });
    if (paymentMethod === 'dinheiro' && parseFloat(amountPaid || '0') < total) return toast({ title: 'Valor pago insuficiente', variant: 'destructive' });
    setShowConfirmDialog(true);
  };

  const finalizeSale = async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    const { data: sale, error } = await supabase.from('sales').insert({
      user_id: user?.id,
      customer_id: selectedCustomer?.id || null,
      subtotal,
      discount,
      total,
      payment_method: paymentMethod,
      amount_paid: paymentMethod === 'dinheiro' ? parseFloat(amountPaid) : total,
      change_amount: change
    }).select().single();

    if (error || !sale) {
      toast({ title: 'Erro ao finalizar venda', variant: 'destructive' });
      setLoading(false);
      return;
    }

    await Promise.all(cart.map(i =>
      supabase.from('sale_items').insert({
        sale_id: sale.id,
        product_id: i.product.id,
        product_name: i.product.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount,
        total: i.unit_price * i.quantity - i.discount
      })
    ));

    const trackedItems = cart.filter(i => i.product.track_stock);
    if (trackedItems.length > 0) {
      const stockResults = await Promise.all(trackedItems.map(i =>
        supabase
          .from('products')
          .update({ stock_quantity: Number(i.product.stock_quantity) - i.quantity })
          .eq('id', i.product.id)
      ));
      const stockError = stockResults.find(r => r.error);
      if (stockError?.error) {
        toast({ title: 'Erro ao atualizar estoque do produto', variant: 'destructive' });
      }

      const movementResults = await Promise.all(trackedItems.map(i =>
        supabase.from('stock_movements').insert({
          product_id: i.product.id,
          movement_type: 'saida',
          quantity: i.quantity,
          reason: `Venda PDV #${sale.id.slice(0, 8)}`,
          user_id: user?.id
        })
      ));
      const movementError = movementResults.find(r => r.error);
      if (movementError?.error) {
        toast({ title: 'Erro ao registrar movimentacao de estoque', variant: 'destructive' });
      }
    }

    const productIds = cart.map(i => i.product.id);
    const { data: productSupplies, error: productSuppliesError } = await supabase
      .from('product_supplies')
      .select('product_id, supply_id, quantity')
      .in('product_id', productIds);

    if (productSuppliesError) {
      toast({ title: 'Erro ao carregar insumos do produto', variant: 'destructive' });
    } else if (productSupplies && productSupplies.length > 0) {
      const quantitiesByProduct = new Map(cart.map(i => [i.product.id, i.quantity]));
      const usageBySupply: Record<string, number> = {};

      productSupplies.forEach((ps: any) => {
        const qty = quantitiesByProduct.get(ps.product_id);
        if (!qty) return;
        const usage = Number(ps.quantity) * qty;
        if (usage <= 0) return;
        usageBySupply[ps.supply_id] = (usageBySupply[ps.supply_id] || 0) + usage;
      });

      const supplyIds = Object.keys(usageBySupply);
      if (supplyIds.length > 0) {
        const { data: suppliesData, error: suppliesError } = await supabase
          .from('supplies')
          .select('id, stock_quantity')
          .in('id', supplyIds);

        if (suppliesError) {
          toast({ title: 'Erro ao carregar estoque de insumos', variant: 'destructive' });
        } else if (suppliesData && suppliesData.length > 0) {
          const supplyUpdates = await Promise.all(suppliesData.map((supply: any) => {
            const usage = usageBySupply[supply.id] || 0;
            const newStock = Number(supply.stock_quantity) - usage;
            return supabase.from('supplies').update({ stock_quantity: newStock }).eq('id', supply.id);
          }));

          const supplyUpdateError = supplyUpdates.find(r => r.error);
          if (supplyUpdateError?.error) {
            toast({ title: 'Erro ao atualizar estoque de insumos', variant: 'destructive' });
          }
        }
      }
    }

    setLastSale({
      id: sale.id,
      items: [...cart],
      subtotal,
      discount,
      total,
      paymentMethod,
      amountPaid: paymentMethod === 'dinheiro' ? parseFloat(amountPaid) : total,
      change,
      createdAt: new Date(),
      customer: selectedCustomer
    });

    toast({ title: 'Venda finalizada com sucesso!' });
    setCart([]);
    setDiscount(0);
    setAmountPaid('');
    setSelectedCustomer(null);
    setLoading(false);
    setShowReceipt(true);
  };

  const handlePrint = () => {
    if (receiptRef.current) {
      const printContent = receiptRef.current.innerHTML;
      const printWindow = window.open('', '', 'width=900,height=700');
      if (printWindow) {
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
      }
    }
  };

  return (
    <div className="page-container flex min-h-0 flex-col gap-6 bg-slate-50/70">
      <div className="flex items-center justify-between gap-4 flex-wrap rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">PDV - Ponto de Venda</h1>
            <p className="text-xs text-slate-500">Ponto de venda</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
          Plano ativo
        </Badge>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">PDV</h2>
        <p className="text-sm text-slate-500">Ponto de venda</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                ref={barcodeInputRef}
                placeholder="Leia o codigo de barras aqui..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </form>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="min-h-[520px] rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6">
                {!search.trim() ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
                    <div className="h-12 w-12 rounded-full bg-white shadow flex items-center justify-center mb-3">
                      <ShoppingBag className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-700">Aguardando produtos</p>
                    <p className="mt-1 max-w-sm">
                      Digite um nome ou leia um codigo de barras para buscar produtos e iniciar a venda.
                    </p>
                  </div>
                ) : productsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Buscando produtos...
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Nenhum produto encontrado.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.map((p) => (
                      <Card
                        key={p.id}
                        className="cursor-pointer hover:border-primary transition-colors shadow-sm"
                        onClick={() => addToCart(p)}
                      >
                        <CardContent className="p-3">
                          <div className="aspect-square bg-white rounded-lg mb-3 border border-slate-200 flex items-center justify-center overflow-hidden">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <ShoppingCart className="h-8 w-8 text-slate-300" />
                            )}
                          </div>
                          <p className="font-medium text-sm truncate">{p.name}</p>
                          <p className="text-primary font-semibold">{formatCurrency(getUnitPrice(p))}</p>
                          <p className="text-xs text-slate-400">
                            {p.track_stock ? `Estoque: ${p.stock_quantity}` : 'Sem controle de estoque'}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white flex flex-col overflow-hidden lg:sticky lg:top-6 max-h-[calc(100vh-6rem)] shadow-sm">
          <CardHeader className="border-b space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Carrinho</CardTitle>
            </div>
            <CustomerSearch selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-3 p-4">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500 py-12">
                <ShoppingCart className="h-10 w-10 text-slate-300 mb-3" />
                Carrinho vazio
              </div>
            ) : cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="h-12 w-12 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                  {item.product.image_url ? (
                    <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingCart className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.product.name}</p>
                  <p className="text-xs text-slate-400">{formatCurrency(item.unit_price)} x {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="border-t p-4 flex-col gap-4">
            <div className="w-full space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between items-center">
                <span>Desconto</span>
                <CurrencyInput value={discount} onChange={setDiscount} className="w-24 h-8" />
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>
            <div className="w-full space-y-2">
              <div className={paymentMethod === 'dinheiro' ? 'grid grid-cols-[1fr_140px] gap-2 items-center' : ''}>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro"><div className="flex items-center gap-2"><Banknote className="h-4 w-4" />Dinheiro</div></SelectItem>
                    <SelectItem value="cartao"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Cartao</div></SelectItem>
                    <SelectItem value="pix"><div className="flex items-center gap-2"><Smartphone className="h-4 w-4" />PIX</div></SelectItem>
                  </SelectContent>
                </Select>
                {paymentMethod === 'dinheiro' && (
                  <CurrencyInput
                    placeholder="Valor pago"
                    value={parseFloat(amountPaid) || 0}
                    onChange={(value) => setAmountPaid(value.toString())}
                    className="h-10"
                  />
                )}
              </div>
              {paymentMethod === 'dinheiro' && change > 0 && (
                <div className="w-full text-center text-emerald-600 font-medium">Troco: {formatCurrency(change)}</div>
              )}
            </div>
            <Button className="w-full" size="lg" onClick={handleFinalizeSale} disabled={loading || cart.length === 0}>
              {loading ? 'Finalizando...' : (
                <span className="flex items-center justify-center gap-2">
                  Finalizar Venda
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Venda</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between">
                  <span>Itens:</span>
                  <span className="font-medium">{cart.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-bold text-lg">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pagamento:</span>
                  <span className="capitalize">{paymentMethod === 'dinheiro' ? 'Dinheiro' : paymentMethod === 'cartao' ? 'Cartao' : 'PIX'}</span>
                </div>
                {selectedCustomer && (
                  <div className="flex justify-between">
                    <span>Cliente:</span>
                    <span>{selectedCustomer.name}</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={finalizeSale}>Confirmar Venda</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-[1100px] w-[min(96vw,1100px)] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Recibo da Venda</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Comprovante de venda</DialogDescription>
          </DialogHeader>
          {lastSale && (
            <SaleReceipt
              ref={receiptRef}
              saleId={lastSale.id}
              items={lastSale.items.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                unitPrice: item.unit_price
              }))}
              subtotal={lastSale.subtotal}
              discount={lastSale.discount}
              total={lastSale.total}
              paymentMethod={lastSale.paymentMethod}
              amountPaid={lastSale.amountPaid}
              change={lastSale.change}
              company={company}
              customer={lastSale.customer}
              createdAt={lastSale.createdAt}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => setShowReceipt(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
