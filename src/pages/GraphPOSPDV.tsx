import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Barcode, User, Plus, Minus, Trash2 } from 'lucide-react';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario } from '@/components/graphpos/GraphPOSButtons';
import { supabase } from '@/integrations/supabase/client';
import { Product, CartItem, Customer } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveSuggestedPrice } from '@/lib/pricing';
import { useToast } from '@/hooks/use-toast';
import { getGraphPOSCheckoutState, setGraphPOSCheckoutState } from '@/lib/graphposCheckout';

export default function GraphPOSPDV() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  // Mock-only flow for layout navigation.

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    const checkout = getGraphPOSCheckoutState();
    if (!checkout) return;
    if (checkout.customer && !selectedCustomer) {
      setSelectedCustomer({
        id: checkout.customer.id,
        name: checkout.customer.name,
        document: checkout.customer.document || null,
        email: checkout.customer.email || null,
        phone: checkout.customer.phone || null,
        address: null,
        city: null,
        state: null,
        zip_code: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (checkout.editingCustomer) {
      setShowCustomerDropdown(true);
      setCustomerSearch('');
      setSelectedCustomer(null);
      setGraphPOSCheckoutState({
        ...checkout,
        editingCustomer: false,
      });
    }
  }, [selectedCustomer]);

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

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerOptions([]);
      setCustomerLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setCustomerLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${term}%,document.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(10);

      if (error) {
        toast({ title: 'Erro ao buscar clientes', variant: 'destructive' });
        setCustomerOptions([]);
        setCustomerLoading(false);
        return;
      }

      setCustomerOptions((data as Customer[]) || []);
      setCustomerLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [customerSearch, toast]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const getUnitPrice = (product: Product) => resolveSuggestedPrice(product, 1, [], 0);

  const addToCart = (product: Product) => {
    const existing = cart.find((i) => i.product.id === product.id);
    if (existing) {
      setCart(cart.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
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
    setCart(cart.map((i) => {
      if (i.product.id === productId) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter((i) => i.product.id !== productId));

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
      return;
    }

    const mapped = {
      ...(data as Product),
      image_url: ensurePublicStorageUrl('product-images', data.image_url),
    };
    addToCart(mapped);
    setBarcodeInput('');
  };

  const subtotal = cart.reduce((acc, i) => acc + (i.unit_price * i.quantity - i.discount), 0);
  const total = Math.max(0, subtotal - discount);

  const handleFinalize = () => {
    if (cart.length === 0) {
      toast({ title: 'Carrinho vazio', variant: 'destructive' });
      return;
    }

    setGraphPOSCheckoutState({
      items: cart.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })),
      subtotal,
      discount,
      total,
      paymentMethod: 'dinheiro',
      amountPaid: total,
      customer: selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            document: selectedCustomer.document || undefined,
            email: selectedCustomer.email || undefined,
            phone: selectedCustomer.phone || undefined,
          }
        : undefined,
    });
    navigate('/pagamento');
  };

  return (
    <div className="w-full bg-transparent font-sans text-slate-900">
      <main className="mx-auto w-full px-auto pb-12 pt-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-bold">PDV</h1>
            <p className="text-sm text-slate-500">Ponto de venda</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <form className="relative" onSubmit={handleBarcodeSubmit}>
                <Barcode className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 text-sm text-slate-700 outline-none ring-sky-100 focus:border-sky-400 focus:ring-2"
                  placeholder="Leia o codigo de barras aqui..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
              </form>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 text-sm text-slate-700 outline-none ring-sky-100 focus:border-sky-400 focus:ring-2"
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <GraphPOSCard className="min-h-[520px] p-0">
              <div className="h-full min-h-[520px] rounded-2xl border border-dashed border-slate-200 bg-[radial-gradient(circle,_#E5E7EB_1px,_transparent_1px)] bg-[length:18px_18px] p-10">
                {!search.trim() ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <div className="flex max-w-md flex-col items-center gap-3 text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                        <ShoppingCart className="h-6 w-6 text-slate-400" />
                      </div>
                      <h2 className="text-base font-semibold text-slate-700">Aguardando produtos</h2>
                      <p className="text-sm">
                        Digite um nome ou leia um codigo de barras para buscar produtos e iniciar a venda.
                      </p>
                    </div>
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
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-sky-300"
                      >
                        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingCart className="h-8 w-8 text-slate-300" />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                        <p className="text-sm font-semibold text-sky-600">{formatCurrency(getUnitPrice(product))}</p>
                        <p className="text-xs text-slate-400">
                          {product.track_stock ? `Estoque: ${product.stock_quantity}` : 'Sem controle de estoque'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </GraphPOSCard>
          </div>

          <div className="lg:sticky lg:top-8">
            <GraphPOSSidebarResumo title="Carrinho">
              <div className="space-y-5">
                <div className="relative" ref={customerRef}>
                  {selectedCustomer ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <User className="h-4 w-4 text-slate-400" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{selectedCustomer.name}</p>
                        <p className="text-xs text-slate-500">
                          {[selectedCustomer.document, selectedCustomer.phone, selectedCustomer.email]
                            .filter(Boolean)
                            .join(' | ') || 'Sem contato'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-400"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustomerSearch('');
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <>
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 text-sm text-slate-700 outline-none"
                        placeholder="Buscar cliente (nome, CPF, telefone)..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => customerSearch.length >= 2 && setShowCustomerDropdown(true)}
                      />
                    </>
                  )}

                  {showCustomerDropdown && !selectedCustomer && customerSearch.length >= 2 && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white py-2 text-sm shadow-lg">
                      {customerLoading ? (
                        <div className="px-4 py-2 text-slate-500">Buscando...</div>
                      ) : customerOptions.length === 0 ? (
                        <div className="px-4 py-2 text-slate-500">Nenhum cliente encontrado</div>
                      ) : (
                        customerOptions.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setCustomerSearch('');
                              setShowCustomerDropdown(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50"
                          >
                            <User className="h-4 w-4 text-slate-400" />
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{customer.name}</p>
                              <p className="text-xs text-slate-500">
                                {[customer.document, customer.phone, customer.email].filter(Boolean).join(' | ') || 'Sem contato'}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                    <ShoppingCart className="h-8 w-8 text-slate-300" />
                    Carrinho vazio
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.product.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {item.product.image_url ? (
                            <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingCart className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{item.product.name}</p>
                          <p className="text-xs text-slate-500">{formatCurrency(item.unit_price)} x {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                            onClick={() => updateQuantity(item.product.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-5 text-center text-xs text-slate-600">{item.quantity}</span>
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                            onClick={() => updateQuantity(item.product.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-red-500"
                            onClick={() => removeFromCart(item.product.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Subtotal</span>
                    <span className="font-medium text-slate-900">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Desconto</span>
                    <input
                      className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-2 text-right text-sm text-slate-600"
                      value={discount.toFixed(2).replace('.', ',')}
                      onChange={(e) => {
                        const value = Number(e.target.value.replace(',', '.'));
                        setDiscount(Number.isNaN(value) ? 0 : value);
                      }}
                    />
                  </div>
                  <div className="h-px w-full bg-slate-200" />
                  <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                  </div>
                </div>
                <BotaoPrimario onClick={handleFinalize}>Finalizar Venda</BotaoPrimario>
              </div>
            </GraphPOSSidebarResumo>
          </div>
        </div>
      </main>
    </div>
  );
}
