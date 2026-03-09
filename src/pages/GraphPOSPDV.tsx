import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Barcode, User, Plus, Minus, Trash2 } from 'lucide-react';
import GraphPOSCard from '@/components/graphpos/GraphPOSCard';
import GraphPOSSidebarResumo from '@/components/graphpos/GraphPOSSidebarResumo';
import { BotaoPrimario } from '@/components/graphpos/GraphPOSButtons';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { Product, CartItem, Customer, PriceTier } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import {
  getInitialTierQuantity,
  getProductPriceTiers,
  getPriceTierValidationMessage,
  isQuantityAllowedByPriceTiers,
  resolveProductPrice,
} from '@/lib/pricing';
import { normalizeBarcode } from '@/lib/barcode';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getGraphPOSCheckoutState, setGraphPOSCheckoutState } from '@/lib/graphposCheckout';
import { normalizeDigits } from '@/components/ui/masked-input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { M2_ATTRIBUTE_KEYS, calculateAreaM2, formatAreaM2, isAreaUnit, parseM2Attributes, parseMeasurementInput } from '@/lib/measurements';
import { cn } from '@/lib/utils';

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const sanitizeIlikeTerm = (value: string) =>
  value
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const productMatchesSearch = (product: Product, rawTerm: string) => {
  const normalizedTerm = normalizeSearchText(rawTerm);
  if (!normalizedTerm) return true;

  const name = normalizeSearchText(product.name || '');
  const sku = normalizeSearchText(product.sku || '');
  const barcode = normalizeSearchText(product.barcode || '');
  if (name.includes(normalizedTerm) || sku.includes(normalizedTerm) || barcode.includes(normalizedTerm)) {
    return true;
  }

  const termDigits = normalizeDigits(rawTerm);
  if (!termDigits) return false;
  const skuDigits = normalizeDigits(product.sku || '');
  const barcodeDigits = normalizeDigits(product.barcode || '');
  return skuDigits.includes(termDigits) || barcodeDigits.includes(termDigits);
};

const graphPosSearchInputClass =
  'h-11 w-full rounded-lg border border-border bg-card pl-11 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15';

const graphPosCompactInputClass =
  'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

const graphPosInlineInputClass =
  'h-9 w-24 rounded-lg border border-border bg-card px-2 text-right text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

export default function GraphPOSPDV() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [productSearchCache, setProductSearchCache] = useState<Product[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
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
    setProductSearchCache(null);
  }, [profile?.company_id]);

  useEffect(() => {
    if (!isMobile) {
      setIsCartDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const loadPriceTiers = async () => {
      let query = supabase.from('price_tiers').select('*').order('min_quantity');
      if (profile?.company_id) {
        const { data: companyProducts } = await supabase
          .from('products')
          .select('id')
          .eq('company_id', profile.company_id);

        const productIds = (companyProducts || []).map((product) => product.id);
        if (productIds.length === 0) {
          setPriceTiers([]);
          return;
        }
        query = query.in('product_id', productIds);
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: 'Erro ao carregar faixas de preço', variant: 'destructive' });
        return;
      }

      setPriceTiers((data as PriceTier[]) || []);
    };

    void loadPriceTiers();
  }, [profile?.company_id, toast]);

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
          id: item.id || createLocalId(),
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
        date_of_birth: null,
        photo_url: null,
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
    const rawTerm = search.trim();
    if (!rawTerm) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setProductsLoading(true);
      const safeTerm = sanitizeIlikeTerm(rawTerm);

      let directMatches: Product[] = [];
      if (safeTerm) {
        let directQuery = supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .or(`name.ilike.%${safeTerm}%,sku.ilike.%${safeTerm}%,barcode.ilike.%${safeTerm}%`)
          .order('name')
          .limit(60);
        if (profile?.company_id) {
          directQuery = directQuery.eq('company_id', profile.company_id);
        }
        const { data, error } = await directQuery;

        if (error) {
          toast({ title: 'Erro ao buscar produtos', variant: 'destructive' });
          setProducts([]);
          setProductsLoading(false);
          return;
        }

        directMatches = (data as unknown as Product[]) || [];
      }

      const mappedDirect = directMatches.map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));

      let filtered = mappedDirect.filter((product) => productMatchesSearch(product, rawTerm));

      if (filtered.length === 0) {
        let cache = productSearchCache;
        if (!cache) {
          let allProductsQuery = supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('name')
            .limit(500);
          if (profile?.company_id) {
            allProductsQuery = allProductsQuery.eq('company_id', profile.company_id);
          }
          const { data: allData, error: allError } = await allProductsQuery;

          if (allError) {
            toast({ title: 'Erro ao buscar produtos', variant: 'destructive' });
            setProducts([]);
            setProductsLoading(false);
            return;
          }

          cache = ((allData as unknown as Product[]) || []).map((product) => ({
            ...product,
            image_url: ensurePublicStorageUrl('product-images', product.image_url),
          }));
          setProductSearchCache(cache);
        }

        filtered = (cache || []).filter((product) => productMatchesSearch(product, rawTerm));
      }

      filtered.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(filtered.slice(0, 20));
      setProductsLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [productSearchCache, profile?.company_id, search, toast]);

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
  const getUnitPrice = (product: Product, quantity = 1) =>
    resolveProductPrice(product, quantity, priceTiers, 0);
  const isM2Product = (product: Product) => isAreaUnit(product.unit);
  const validateTierQuantity = (product: Product, quantity: number) => {
    if (isM2Product(product)) return true;
    if (isQuantityAllowedByPriceTiers(product.id, quantity, priceTiers)) return true;

    toast({
      title: 'Quantidade fora da faixa permitida',
      description: getPriceTierValidationMessage(product.id, priceTiers) || undefined,
      variant: 'destructive',
    });
    return false;
  };

  const getTierRangeLabel = (productId: string) => {
    const tiers = getProductPriceTiers(productId, priceTiers);
    if (tiers.length === 0) return null;

    return tiers
      .map((tier) =>
        tier.max_quantity === null
          ? `${tier.min_quantity}+`
          : `${tier.min_quantity} a ${tier.max_quantity}`,
      )
      .join(', ');
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      if (isM2Product(product)) {
        return [
          ...prev,
          {
            id: createLocalId(),
            product,
            quantity: 0,
            unit_price: getUnitPrice(product, 1),
            discount: 0,
            attributes: {},
          },
        ];
      }

      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQuantity = existing.quantity + 1;
        if (!validateTierQuantity(product, nextQuantity)) {
          return prev;
        }

        return prev.map((i) =>
          i.id === existing.id
            ? { ...i, quantity: nextQuantity, unit_price: getUnitPrice(product, nextQuantity) }
            : i,
        );
      }

      const initialQuantity = getInitialTierQuantity(product.id, priceTiers);
      if (!validateTierQuantity(product, initialQuantity)) {
        return prev;
      }

      return [
        ...prev,
        {
          id: createLocalId(),
          product,
          quantity: initialQuantity,
          unit_price: getUnitPrice(product, initialQuantity),
          discount: 0,
          attributes: {},
        },
      ];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.id !== itemId) return i;
      if (isM2Product(i.product)) return i;
      const newQty = Math.max(1, i.quantity + delta);
      if (!validateTierQuantity(i.product, newQty)) {
        return i;
      }
      return { ...i, quantity: newQty, unit_price: getUnitPrice(i.product, newQty) };
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

  const removeFromCart = (itemId: string) => setCart((prev) => prev.filter((i) => i.id !== itemId));

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const code = normalizeBarcode(barcodeInput);
    let barcodeQuery = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('barcode', code);
    if (profile?.company_id) {
      barcodeQuery = barcodeQuery.eq('company_id', profile.company_id);
    }
    const { data: barcodeMatch, error: barcodeError } = await barcodeQuery.maybeSingle();

    if (barcodeError) {
      toast({ title: 'Erro ao buscar produto', variant: 'destructive' });
      return;
    }

    let productData = barcodeMatch;
    if (!productData) {
      let skuQuery = supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('sku', code);
      if (profile?.company_id) {
        skuQuery = skuQuery.eq('company_id', profile.company_id);
      }
      const { data: skuMatch, error: skuError } = await skuQuery.maybeSingle();

      if (skuError || !skuMatch) {
        toast({ title: 'Produto não encontrado', description: `Código: ${barcodeInput}`, variant: 'destructive' });
        return;
      }
      productData = skuMatch;
    }

    const mapped = {
      ...(productData as unknown as Product),
      image_url: ensurePublicStorageUrl('product-images', productData.image_url),
    };
    addToCart(mapped);
    setBarcodeInput('');
  };

  const subtotal = cart.reduce((acc, i) => acc + (i.unit_price * i.quantity - i.discount), 0);
  const total = Math.max(0, subtotal - discount);
  const cartItemsLabel = `${cart.length} ${cart.length === 1 ? 'item' : 'itens'}`;
  const hasUnsavedChanges = cart.length > 0 || discount > 0 || Boolean(selectedCustomer);
  const dottedSurfaceStyle = {
    backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 0.8px, transparent 0.8px)',
    backgroundSize: '20px 20px',
  } as const;

  useUnsavedChanges(hasUnsavedChanges);

  const handleFinalize = () => {
    if (cart.length === 0) {
      toast({ title: 'Carrinho vazio', variant: 'destructive' });
      return;
    }

    const invalidTierItems = cart.filter((item) => {
      if (isM2Product(item.product)) return false;
      return !isQuantityAllowedByPriceTiers(item.product.id, item.quantity, priceTiers);
    });

    if (invalidTierItems.length > 0) {
      toast({
        title: 'Quantidade fora da faixa permitida',
        description: getPriceTierValidationMessage(invalidTierItems[0].product.id, priceTiers) || undefined,
        variant: 'destructive',
      });
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

  const cartPanelContent = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative" ref={customerRef}>
        {selectedCustomer ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{selectedCustomer.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[selectedCustomer.document, selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' | ') || 'Sem contato'}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-destructive transition hover:text-destructive/80"
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
            <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={graphPosSearchInputClass}
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
          <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-popover py-2 text-sm text-popover-foreground shadow-lg">
            {customerLoading ? (
              <div className="px-4 py-2 text-muted-foreground">Buscando...</div>
            ) : customerOptions.length === 0 ? (
              <div className="px-4 py-2 text-muted-foreground">Nenhum cliente encontrado</div>
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
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-muted/70"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[customer.document, customer.phone, customer.email].filter(Boolean).join(' | ') || 'Sem contato'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/45 text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            Carrinho vazio
          </div>
        ) : (
          <div className="space-y-2.5">
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
                <div key={item.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
                      {item.product.image_url ? (
                        <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold leading-5 text-foreground">{item.product.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {formatCurrency(item.unit_price)}
                          {isM2 ? ' / m\u00B2' : ''}
                        </span>
                        <span>{isM2 ? areaLabel : `Qtd ${item.quantity}`}</span>
                      </div>
                      {getTierRangeLabel(item.product.id) && !isM2 && (
                        <p className="text-[11px] text-muted-foreground">
                          Faixas: {getTierRangeLabel(item.product.id)}
                        </p>
                      )}
                      {isM2 && hasValidDimensions && (
                        <p className="text-[11px] text-muted-foreground">{dimensionLabel}</p>
                      )}
                    </div>

                    <div className="flex min-w-[92px] flex-col items-end justify-between gap-2">
                      <p className="text-right text-sm font-semibold leading-5 text-foreground">
                        {formatCurrency(item.unit_price * item.quantity - item.discount)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {!isM2 && (
                          <>
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/45 hover:text-foreground"
                              onClick={() => updateQuantity(item.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-6 text-center text-xs font-medium text-muted-foreground">{item.quantity}</span>
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/45 hover:text-foreground"
                              onClick={() => updateQuantity(item.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-destructive transition hover:border-destructive/40 hover:bg-destructive/10"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isM2 && (
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Largura (cm)</span>
                        <input
                          className={graphPosCompactInputClass}
                          inputMode="decimal"
                          value={widthRaw}
                          onChange={(e) => updateM2Value(item.id, M2_ATTRIBUTE_KEYS.widthCm, e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Altura (cm)</span>
                        <input
                          className={graphPosCompactInputClass}
                          inputMode="decimal"
                          value={heightRaw}
                          onChange={(e) => updateM2Value(item.id, M2_ATTRIBUTE_KEYS.heightCm, e.target.value)}
                        />
                      </label>
                      <div className={`col-span-1 text-[11px] ${hasValidDimensions ? 'text-muted-foreground' : 'text-destructive'} sm:col-span-2`}>
                        Área: {hasValidDimensions ? `${formatAreaM2(item.quantity)} m\u00B2` : 'Preencha largura e altura válidas'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto shrink-0 border-t border-border pt-3">
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Desconto</span>
            <input
              className={graphPosInlineInputClass}
              inputMode="decimal"
              value={discount.toFixed(2).replace('.', ',')}
              onChange={(e) => {
                const value = Number(e.target.value.replace(',', '.'));
                setDiscount(Number.isNaN(value) ? 0 : value);
              }}
            />
          </div>
          <div className="h-px w-full bg-border" />
          <div className="flex items-center justify-between text-lg font-semibold text-foreground">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
        <BotaoPrimario
          type="button"
          onClick={handleFinalize}
          className="mt-4 h-[46px] w-full rounded-[10px]"
        >
          Finalizar Venda
        </BotaoPrimario>
      </div>
    </div>
  );

  return (
    <div className="w-full bg-background font-sans text-foreground md:h-full md:min-h-0 md:overflow-hidden">
      <main
        className={cn(
          'w-full pt-2 md:flex md:h-full md:min-h-0 md:flex-col',
          isMobile ? 'pb-28' : 'pb-14 md:pb-0',
        )}
      >
        <div className="mb-4 flex items-center justify-between md:shrink-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">PDV</h1>
            <p className="text-sm text-muted-foreground">Ponto de venda</p>
          </div>
        </div>

        <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] md:items-stretch xl:gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
          <div className="flex min-h-0 flex-col gap-4 md:gap-5">
            <div className="grid gap-3 sm:grid-cols-2 md:shrink-0 lg:gap-4">
              <form className="relative" onSubmit={handleBarcodeSubmit}>
                <Barcode className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={graphPosSearchInputClass}
                  placeholder="Leia o código de barras aqui..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
              </form>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={graphPosSearchInputClass}
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <GraphPOSCard className="flex min-h-0 flex-1 p-0">
              <div
                className="h-[60vh] min-h-[360px] w-full flex-1 overflow-hidden rounded-xl border border-dashed border-border bg-card/90 p-5 shadow-sm sm:p-6 md:h-full md:min-h-0"
                style={dottedSurfaceStyle}
              >
                {!search.trim() ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <div className="flex max-w-md flex-col items-center gap-4 text-muted-foreground">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                        <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <h2 className="text-base font-semibold text-foreground">Aguardando produtos</h2>
                      <p className="text-sm">
                        Digite um nome ou leia um código de barras para buscar produtos e iniciar a venda.
                      </p>
                    </div>
                  </div>
                ) : productsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Buscando produtos...
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-5 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1900px]:grid-cols-6">
                      {products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product)}
                          className="group rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
                        >
                          <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                            ) : (
                              <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-sm font-semibold leading-5 text-foreground">{product.name}</p>
                          <p className="text-sm font-semibold text-primary">
                            {formatCurrency(getUnitPrice(product, 1))}
                            {isM2Product(product) ? ' / m\u00B2' : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {product.track_stock ? `Estoque: ${product.stock_quantity}` : 'Sem controle de estoque'}
                          </p>
                          {getTierRangeLabel(product.id) ? (
                            <p className="text-xs text-muted-foreground">
                              Faixas: {getTierRangeLabel(product.id)}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </GraphPOSCard>
          </div>

          {!isMobile && (
            <div className="min-h-[320px] md:h-full md:min-h-0">
              <GraphPOSSidebarResumo
                title="Carrinho"
                className="flex h-full min-h-0 flex-col rounded-xl p-4 shadow-md xl:p-5"
              >
                {cartPanelContent}
              </GraphPOSSidebarResumo>
            </div>
          )}
        </div>

        {isMobile && (
          <>
            <Drawer open={isCartDrawerOpen} onOpenChange={setIsCartDrawerOpen}>
              <DrawerContent className="h-[88vh] max-h-[88vh] border-border bg-background/95 px-0">
                <DrawerHeader className="px-4 pb-2 text-left">
                  <DrawerTitle>Carrinho</DrawerTitle>
                  <DrawerDescription>Revise itens, cliente e desconto antes de finalizar a venda.</DrawerDescription>
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
                  <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
                    {cartPanelContent}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
              <div className="mx-auto flex max-w-3xl items-center gap-3">
                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Carrinho</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-muted-foreground">{cartItemsLabel}</span>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
                  </div>
                </div>
                <BotaoPrimario
                  type="button"
                  onClick={() => setIsCartDrawerOpen(true)}
                  className="h-12 w-auto min-w-[140px] rounded-2xl px-5"
                >
                  Ver carrinho
                </BotaoPrimario>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
