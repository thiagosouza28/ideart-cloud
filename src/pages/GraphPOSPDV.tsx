import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Barcode, User, Plus, Minus, Trash2 } from 'lucide-react';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario } from '@/components/graphpos/GraphPOSButtons';
import { supabase } from '@/integrations/supabase/client';
import { Product, CartItem, Customer } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveProductPrice } from '@/lib/pricing';
import { normalizeBarcode } from '@/lib/barcode';
import { useToast } from '@/hooks/use-toast';
import { getGraphPOSCheckoutState, setGraphPOSCheckoutState } from '@/lib/graphposCheckout';
import { normalizeDigits } from '@/components/ui/masked-input';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { M2_ATTRIBUTE_KEYS, calculateAreaM2, formatAreaM2, isAreaUnit, parseM2Attributes, parseMeasurementInput } from '@/lib/measurements';

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
  const draftHydratedRef = useRef(false);
  const draftStorageKey = 'graphpos_pdv_draft';
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
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      draftHydratedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        cart?: CartItem[];
        discount?: number;
        customer?: Customer | null;
      };
      if (parsed.cart && Array.isArray(parsed.cart)) {
        const restored = parsed.cart.map((item) => ({
          id: item.id || crypto.randomUUID(),
          ...item,
          product: {
            ...item.product,
            image_url: ensurePublicStorageUrl('product-images', item.product.image_url),
          },
          attributes: item.attributes || {},
        }));
        setCart(restored);
      }
      if (typeof parsed.discount === 'number') {
        setDiscount(parsed.discount);
      }
      if (parsed.customer) {
        setSelectedCustomer(parsed.customer);
      }
      if ((parsed.cart && parsed.cart.length > 0) || parsed.discount || parsed.customer) {
        toast({ title: 'Rascunho restaurado' });
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      draftHydratedRef.current = true;
    }
  }, [draftStorageKey, toast]);

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
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
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
      const digits = normalizeDigits(term);
      const filters = [`name.ilike.%${term}%`];
      if (digits) {
        filters.push(`document.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
      }
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(filters.join(','))
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

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const hasData = cart.length > 0 || discount > 0 || Boolean(selectedCustomer);
    if (!hasData) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        cart,
        discount,
        customer: selectedCustomer,
      }),
    );
  }, [cart, discount, draftStorageKey, selectedCustomer]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatMeasurement = (v: number) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
  const getUnitPrice = (product: Product, quantity = 1) => resolveProductPrice(product, quantity, [], 0);
  const isM2Product = (product: Product) => isAreaUnit(product.unit);

  const addToCart = (product: Product) => {
    if (isM2Product(product)) {
      setCart([
        ...cart,
        {
          id: crypto.randomUUID(),
          product,
          quantity: 0,
          unit_price: getUnitPrice(product, 1),
          discount: 0,
          attributes: {},
        },
      ]);
      return;
    }

    const existing = cart.find((i) => i.product.id === product.id);
    if (existing) {
      setCart(cart.map((i) => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([
        ...cart,
        {
          id: crypto.randomUUID(),
          product,
          quantity: 1,
          unit_price: getUnitPrice(product, 1),
          discount: 0,
          attributes: {},
        },
      ]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(cart.map((i) => {
      if (i.id !== itemId) return i;
      if (isM2Product(i.product)) return i;
      const newQty = Math.max(1, i.quantity + delta);
      return { ...i, quantity: newQty };
    }));
  };

  const updateM2Value = (itemId: string, key: string, value: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (!isM2Product(item.product)) return item;

        const nextAttributes = { ...(item.attributes || {}) };
        nextAttributes[key] = value;

        const widthCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.widthCm]);
        const heightCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.heightCm]);
        const hasValidDimensions =
          typeof widthCm === 'number' &&
          typeof heightCm === 'number' &&
          widthCm > 0 &&
          heightCm > 0;

        if (hasValidDimensions) {
          const area = calculateAreaM2(widthCm, heightCm);
          nextAttributes[M2_ATTRIBUTE_KEYS.areaM2] = area.toFixed(4);
          const unitPrice = getUnitPrice(item.product, area);
          return {
            ...item,
            attributes: nextAttributes,
            quantity: area,
            unit_price: unitPrice,
          };
        }

        delete nextAttributes[M2_ATTRIBUTE_KEYS.areaM2];
        return {
          ...item,
          attributes: nextAttributes,
          quantity: 0,
          unit_price: getUnitPrice(item.product, 1),
        };
      }),
    );
  };

  const removeFromCart = (itemId: string) => setCart(cart.filter((i) => i.id !== itemId));

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const code = normalizeBarcode(barcodeInput);
    const { data: barcodeMatch, error: barcodeError } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('barcode', code)
      .maybeSingle();

    if (barcodeError) {
      toast({ title: 'Erro ao buscar produto', variant: 'destructive' });
      return;
    }

    let productData = barcodeMatch;
    if (!productData) {
      const { data: skuMatch, error: skuError } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('sku', code)
        .maybeSingle();

      if (skuError || !skuMatch) {
        toast({ title: 'Produto não encontrado', description: `Código: ${barcodeInput}`, variant: 'destructive' });
        return;
      }
      productData = skuMatch;
    }

    const mapped = {
      ...(productData as Product),
      image_url: ensurePublicStorageUrl('product-images', productData.image_url),
    };
    addToCart(mapped);
    setBarcodeInput('');
  };

  const subtotal = cart.reduce((acc, i) => acc + (i.unit_price * i.quantity - i.discount), 0);
  const total = Math.max(0, subtotal - discount);
  const hasUnsavedChanges = cart.length > 0 || discount > 0 || Boolean(selectedCustomer);

  useUnsavedChanges(hasUnsavedChanges);

  const handleFinalize = () => {
    if (cart.length === 0) {
      toast({ title: 'Carrinho vazio', variant: 'destructive' });
      return;
    }

    const invalidM2Items = cart.filter((item) => {
      if (!isM2Product(item.product)) return false;
      const { widthCm, heightCm } = parseM2Attributes(item.attributes);
      return !widthCm || !heightCm || widthCm <= 0 || heightCm <= 0;
    });

    if (invalidM2Items.length > 0) {
      toast({
        title: 'Informe largura e altura',
        description: invalidM2Items.map((item) => item.product.name).join(', '),
        variant: 'destructive',
      });
      return;
    }

    setGraphPOSCheckoutState({
      items: cart.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        unitLabel: isM2Product(item.product) ? 'm\u00B2' : 'un',
        ...parseM2Attributes(item.attributes),
        areaM2: isM2Product(item.product) ? item.quantity : undefined,
        attributes: item.attributes || {},
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
    <div className="w-full bg-slate-50 font-sans text-slate-900">
      <main className="mx-auto w-full max-w-[1400px] px-8 pb-14 pt-8">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">PDV</h1>
            <p className="text-sm text-slate-500">Ponto de venda</p>
          </div>
        </div>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_30%]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <form className="relative" onSubmit={handleBarcodeSubmit}>
                <Barcode className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Leia o código de barras aqui..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
              </form>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <GraphPOSCard className="min-h-[540px] p-0">
              <div className="h-full min-h-[520px] rounded-xl border border-dashed border-slate-200 bg-white p-10 shadow-[0_6px_20px_rgba(15,23,42,0.06)] bg-[radial-gradient(circle,_#e2e8f0_0.8px,_transparent_0.8px)] [background-size:20px_20px]">
                {!search.trim() ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <div className="flex max-w-md flex-col items-center gap-4 text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                        <ShoppingCart className="h-6 w-6 text-slate-400" />
                      </div>
                      <h2 className="text-base font-semibold text-slate-700">Aguardando produtos</h2>
                      <p className="text-sm">
                        Digite um nome ou leia um código de barras para buscar produtos e iniciar a venda.
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
                        className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-sky-300 hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                      >
                        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingCart className="h-8 w-8 text-slate-300" />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                        <p className="text-sm font-semibold text-sky-600">
                          {formatCurrency(getUnitPrice(product, 1))}
                          {isM2Product(product) ? ' / m\u00B2' : ''}
                        </p>
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
            <GraphPOSSidebarResumo
              title="Carrinho"
              className="rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
            >
              <div className="space-y-5">
                <div className="relative" ref={customerRef}>
                  {selectedCustomer ? (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
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
                        className="text-xs font-semibold text-red-500 hover:text-red-600"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustomerSearch('');
                          const checkout = getGraphPOSCheckoutState();
                          if (checkout) {
                            setGraphPOSCheckoutState({
                              ...checkout,
                              customer: undefined,
                            });
                          }
                          toast({ title: 'Cliente removido do pedido' });
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <>
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                    <ShoppingCart className="h-8 w-8 text-slate-300" />
                    Carrinho vazio
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const isM2 = isM2Product(item.product);
                      const widthRaw = item.attributes?.[M2_ATTRIBUTE_KEYS.widthCm] ?? '';
                      const heightRaw = item.attributes?.[M2_ATTRIBUTE_KEYS.heightCm] ?? '';
                      const widthCm = parseMeasurementInput(widthRaw);
                      const heightCm = parseMeasurementInput(heightRaw);
                      const hasValidDimensions =
                        typeof widthCm === 'number' &&
                        typeof heightCm === 'number' &&
                        widthCm > 0 &&
                        heightCm > 0;
                      const areaLabel = hasValidDimensions
                        ? `${formatAreaM2(item.quantity)} m\u00B2`
                        : 'Informe largura e altura';
                      const dimensionLabel = hasValidDimensions
                        ? `${formatMeasurement(widthCm as number)}cm x ${formatMeasurement(heightCm as number)}cm`
                        : '';

                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                              {item.product.image_url ? (
                                <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                              ) : (
                                <ShoppingCart className="h-5 w-5 text-slate-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-800">{item.product.name}</p>
                              <p className="text-xs text-slate-500">
                                {formatCurrency(item.unit_price)}
                                {isM2 ? ' / m\u00B2' : ''}{' '}
                                {isM2 ? areaLabel : `x ${item.quantity}`}
                              </p>
                              {isM2 && hasValidDimensions && (
                                <p className="text-[11px] text-slate-400">
                                  {dimensionLabel}
                                </p>
                              )}
                              <p className="text-xs font-semibold text-slate-700">
                                {formatCurrency(item.unit_price * item.quantity - item.discount)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {!isM2 && (
                                <>
                                  <button
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                                    onClick={() => updateQuantity(item.id, -1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-5 text-center text-xs text-slate-600">{item.quantity}</span>
                                  <button
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                                    onClick={() => updateQuantity(item.id, 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                              <button
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-red-500"
                                onClick={() => removeFromCart(item.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {isM2 && (
                            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-400">Largura (cm)</span>
                                <input
                                  className="h-8 rounded-md border border-slate-200 px-2 text-xs"
                                  inputMode="decimal"
                                  value={widthRaw}
                                  onChange={(e) => updateM2Value(item.id, M2_ATTRIBUTE_KEYS.widthCm, e.target.value)}
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-400">Altura (cm)</span>
                                <input
                                  className="h-8 rounded-md border border-slate-200 px-2 text-xs"
                                  inputMode="decimal"
                                  value={heightRaw}
                                  onChange={(e) => updateM2Value(item.id, M2_ATTRIBUTE_KEYS.heightCm, e.target.value)}
                                />
                              </label>
                              <div className={`col-span-1 text-[11px] ${hasValidDimensions ? 'text-slate-500' : 'text-red-500'} sm:col-span-2`}>
                                Área: {hasValidDimensions ? `${formatAreaM2(item.quantity)} m\u00B2` : 'Preencha largura e altura válidas'}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                      className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                      value={discount.toFixed(2).replace('.', ',')}
                      onChange={(e) => {
                        const value = Number(e.target.value.replace(',', '.'));
                        setDiscount(Number.isNaN(value) ? 0 : value);
                      }}
                    />
                  </div>
                  <div className="h-px w-full bg-slate-200" />
                  <div className="flex items-center justify-between text-lg font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                  </div>
                </div>
                <BotaoPrimario
                  onClick={handleFinalize}
                  className="h-[46px] rounded-[10px] bg-sky-500 shadow-[0_8px_20px_rgba(14,165,233,0.25)] hover:bg-sky-600"
                >
                  Finalizar Venda
                </BotaoPrimario>
              </div>
            </GraphPOSSidebarResumo>
          </div>
        </div>
      </main>
    </div>
  );
}


