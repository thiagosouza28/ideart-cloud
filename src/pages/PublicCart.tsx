import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle as Whatsapp, Minus, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CatalogFooter, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { CpfCnpjInput, PhoneInput, normalizeDigits, validateCpf, validatePhone } from '@/components/ui/masked-input';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { useToast } from '@/hooks/use-toast';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { publicSupabase } from '@/integrations/supabase/public-client';
import {
  PUBLIC_CART_UPDATED_EVENT,
  PublicCartItem,
  clearPublicCart,
  getPublicCart,
  getPublicCartItemsCount,
  removePublicCartItem,
  setPublicCartItemQuantity,
} from '@/lib/public-cart';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { Company, PaymentMethod } from '@/types/database';

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function PublicCart() {
  const { slug, companyId } = useParams<{ slug?: string; companyId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCustomerAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cartItems, setCartItems] = useState<PublicCartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    phone?: string;
    document?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    deliveryMethod?: string;
    paymentMethod?: string;
    minimum?: string;
    deliveryMinimum?: string;
    cart?: string;
  }>({});
  const [orderResult, setOrderResult] = useState<{
    orderNumber: number | null;
    customerName: string;
    total: number;
  } | null>(null);
  const [savedAddressLoaded, setSavedAddressLoaded] = useState(false);
  const [hasSavedAddress, setHasSavedAddress] = useState(false);
  const [editingSavedAddress, setEditingSavedAddress] = useState(true);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    document: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    deliveryMethod: 'entrega' as 'entrega' | 'retirada',
    paymentMethod: '' as PaymentMethod | '',
  });

  useEffect(() => {
    if (!user) return;
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    setForm((prev) => ({
      ...prev,
      name: prev.name || (typeof metadata.full_name === 'string' ? metadata.full_name : '') || '',
      phone: prev.phone || user.phone || (typeof metadata.phone === 'string' ? metadata.phone : '') || '',
      document: prev.document || (typeof metadata.cpf === 'string' ? metadata.cpf : '') || '',
      email: prev.email || user.email || '',
    }));
  }, [user]);

  useEffect(() => {
    if (!user?.id || !company?.id) {
      setHasSavedAddress(false);
      setEditingSavedAddress(true);
      setSavedAddressLoaded(true);
      return;
    }

    let isMounted = true;

    const loadSavedCustomerData = async () => {
      setSavedAddressLoaded(false);
      const { data, error } = await customerSupabase
        .from('customers')
        .select('name, phone, document, email, address, city, state, zip_code')
        .eq('company_id', company.id)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isMounted) return;

      if (!error && data) {
        setForm((prev) => ({
          ...prev,
          name: prev.name || data.name || '',
          phone: prev.phone || data.phone || '',
          document: prev.document || data.document || '',
          email: prev.email || data.email || '',
          address: prev.address || data.address || '',
          city: prev.city || data.city || '',
          state: prev.state || data.state || '',
          zipCode: prev.zipCode || data.zip_code || '',
        }));

        const hasAddress =
          Boolean(data.address?.trim()) &&
          Boolean(data.city?.trim()) &&
          Boolean(data.state?.trim()) &&
          normalizeDigits(data.zip_code || '').length >= 8;
        setHasSavedAddress(hasAddress);
        setEditingSavedAddress(!hasAddress);
      } else {
        setHasSavedAddress(false);
        setEditingSavedAddress(true);
      }

      setSavedAddressLoaded(true);
    };

    void loadSavedCustomerData();

    return () => {
      isMounted = false;
    };
  }, [company?.id, user?.id]);

  useEffect(() => {
    const loadCompany = async () => {
      setLoading(true);
      setNotFound(false);

      if (!slug && !companyId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      let query = publicSupabase.from('companies').select('*').eq('is_active', true);
      if (slug) {
        query = query.eq('slug', slug);
      } else if (companyId) {
        query = query.eq('id', companyId);
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCompany(data as Company);
      setLoading(false);
    };

    void loadCompany();
  }, [slug, companyId]);

  useEffect(() => {
    if (!company?.id) {
      setCartItems([]);
      return;
    }

    const refreshCart = () => {
      const items = getPublicCart(company.id).map((item) => ({
        ...item,
        imageUrl: ensurePublicStorageUrl('product-images', item.imageUrl) || item.imageUrl,
      }));
      setCartItems(items);
    };

    const handleStorage = () => {
      refreshCart();
    };

    const handleCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ companyId?: string }>).detail;
      if (!detail?.companyId || detail.companyId === company.id) {
        refreshCart();
      }
    };

    refreshCart();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(PUBLIC_CART_UPDATED_EVENT, handleCartUpdated as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PUBLIC_CART_UPDATED_EVENT, handleCartUpdated as EventListener);
    };
  }, [company?.id]);

  const catalogHref = company?.slug ? `/catalogo/${company.slug}` : '/';
  const customerOrdersPath = useMemo(() => {
    if (!company?.slug) return '/minha-conta/pedidos';
    const params = new URLSearchParams();
    params.set('catalog', catalogHref);
    params.set('company', company.id);
    return `/minha-conta/pedidos?${params.toString()}`;
  }, [catalogHref, company?.id, company?.slug]);
  const customerProfilePath = useMemo(() => {
    if (!company?.slug) return '/minha-conta/perfil';
    const params = new URLSearchParams();
    params.set('catalog', catalogHref);
    params.set('company', company.id);
    return `/minha-conta/perfil?${params.toString()}`;
  }, [catalogHref, company?.id, company?.slug]);
  const customerLoginHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('next', customerOrdersPath);
    if (company?.slug) params.set('catalog', catalogHref);
    if (company?.id) params.set('company', company.id);
    return `/minha-conta/login?${params.toString()}`;
  }, [catalogHref, company?.id, company?.slug, customerOrdersPath]);
  const cartItemsCount = company?.id ? getPublicCartItemsCount(company.id) : 0;
  const minimumOrderValue = Number(company?.minimum_order_value || 0);
  const minimumDeliveryValue = Number(company?.minimum_delivery_value || 0);
  const requiresAddressInput = form.deliveryMethod === 'entrega' && (!user || !hasSavedAddress || editingSavedAddress);
  const orderTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  const openContact = () => {
    if (company?.catalog_contact_url) {
      window.open(company.catalog_contact_url, '_blank');
      return;
    }
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(catalogHref);
  };

  const updateItemQuantity = (productId: string, quantity: number, minOrderQuantity: number) => {
    if (!company?.id) return;
    setPublicCartItemQuantity(company.id, productId, Math.max(minOrderQuantity, quantity));
  };

  const removeItem = (productId: string) => {
    if (!company?.id) return;
    removePublicCartItem(company.id, productId);
  };

  const handleFormFieldChange = (
    field: 'name' | 'phone' | 'document' | 'email' | 'address' | 'city' | 'state' | 'zipCode' | 'deliveryMethod' | 'paymentMethod',
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({
      ...prev,
      [field]: undefined,
      minimum: undefined,
      deliveryMinimum: undefined,
      cart: undefined,
    }));
  };

  const validateCheckout = () => {
    const nextErrors: typeof formErrors = {};

    if (cartItems.length === 0) {
      nextErrors.cart = 'Seu carrinho esta vazio.';
    }

    if (!form.name.trim()) {
      nextErrors.name = 'Informe o nome completo.';
    }

    if (!validatePhone(form.phone)) {
      nextErrors.phone = 'Telefone invalido.';
    }

    const documentDigits = normalizeDigits(form.document);
    if (documentDigits.length !== 11 || !validateCpf(form.document)) {
      nextErrors.document = 'CPF invalido.';
    }

    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Informe um e-mail valido.';
    }

    if (requiresAddressInput) {
      if (!form.address.trim()) {
        nextErrors.address = 'Informe o endereco para entrega/contato.';
      }

      if (!form.city.trim()) {
        nextErrors.city = 'Informe a cidade.';
      }

      if (!form.state.trim() || form.state.trim().length < 2) {
        nextErrors.state = 'Informe o estado (UF).';
      }

      if (normalizeDigits(form.zipCode).length < 8) {
        nextErrors.zipCode = 'Informe um CEP valido.';
      }
    }

    if (!form.paymentMethod) {
      nextErrors.paymentMethod = 'Selecione a forma de pagamento.';
    }

    if (minimumOrderValue > 0 && orderTotal < minimumOrderValue) {
      nextErrors.minimum = `O valor minimo para pedidos e ${asCurrency(minimumOrderValue)}.`;
    }

    if (form.deliveryMethod === 'entrega' && minimumDeliveryValue > 0 && orderTotal < minimumDeliveryValue) {
      nextErrors.deliveryMinimum = `Entrega disponivel apenas a partir de ${asCurrency(minimumDeliveryValue)}.`;
    }

    const invalidMinQuantity = cartItems.find((item) => item.quantity < Math.max(1, item.minOrderQuantity));
    if (invalidMinQuantity) {
      nextErrors.cart = `O produto "${invalidMinQuantity.name}" exige no minimo ${invalidMinQuantity.minOrderQuantity} unidade(s).`;
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company) return;
    if (!validateCheckout()) return;

    setSubmitting(true);
    setOrderResult(null);

    const { data, error } = await customerSupabase.rpc('create_public_order', {
      p_company_id: company.id,
      p_customer_name: form.name.trim(),
      p_customer_phone: normalizeDigits(form.phone),
      p_customer_document: normalizeDigits(form.document),
      p_customer_email: form.email.trim(),
      p_customer_address: form.deliveryMethod === 'entrega' ? form.address.trim() : '',
      p_customer_city: form.deliveryMethod === 'entrega' ? form.city.trim() : '',
      p_customer_state: form.deliveryMethod === 'entrega' ? form.state.trim() : '',
      p_customer_zip_code: form.deliveryMethod === 'entrega' ? normalizeDigits(form.zipCode) : '',
      p_payment_method: form.paymentMethod as PaymentMethod,
      p_items: cartItems.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        notes: item.notes || null,
      })),
    });

    if (error) {
      const isMinOrderError =
        error.message.includes('Minimum order value') ||
        error.message.includes('Valor minimo do pedido');
      const isMinQuantityError =
        error.message.includes('Minimum quantity not reached') ||
        error.message.includes('Quantidade minima nao atingida');

      const errorMessage = isMinOrderError
        ? `O valor minimo para pedidos e ${asCurrency(minimumOrderValue)}.`
        : isMinQuantityError
          ? 'Existe item abaixo da quantidade minima permitida.'
          : error.message;

      if (isMinOrderError) {
        setFormErrors((prev) => ({ ...prev, minimum: errorMessage }));
      }
      if (isMinQuantityError) {
        setFormErrors((prev) => ({ ...prev, cart: errorMessage }));
      }

      toast({
        title: 'Erro ao finalizar pedido',
        description: errorMessage,
        variant: 'destructive',
      });
      setSubmitting(false);
      return;
    }

    const orderNumber = Number((data as { order_number?: number } | null)?.order_number ?? NaN);
    const resolvedOrderNumber = Number.isFinite(orderNumber) ? orderNumber : null;

    setOrderResult({
      orderNumber: resolvedOrderNumber,
      customerName: form.name.trim(),
      total: orderTotal,
    });
    setForm((prev) => {
      if (user) {
        return {
          ...prev,
          paymentMethod: '',
        };
      }
      return {
        name: '',
        phone: '',
        document: '',
        email: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        deliveryMethod: 'entrega',
        paymentMethod: '',
      };
    });
    if (user && form.deliveryMethod === 'entrega') {
      setHasSavedAddress(true);
      setEditingSavedAddress(false);
    }
    clearPublicCart(company.id);
    toast({
      title: 'Pedido enviado com sucesso',
      description: resolvedOrderNumber ? `Pedido #${resolvedOrderNumber} registrado.` : 'Pedido registrado.',
    });
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Carregando carrinho...</p>
      </div>
    );
  }

  if (notFound || !company) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Catalogo nao encontrado</h1>
          <p className="text-slate-500 mb-4">Nao foi possivel carregar os dados da empresa.</p>
          <Link to="/">
            <Button>Voltar ao inicio</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={company}
        subtitle="Carrinho de compras"
        showBack
        onBack={handleBack}
        cartCount={cartItemsCount}
        onCartClick={() => navigate(catalogHref)}
        showAccount
        accountHref={customerOrdersPath}
        showContact
      />

      <main className="mx-auto w-[min(1160px,calc(100%-28px))] py-6">
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link to={catalogHref} className="hover:text-slate-700">Catalogo</Link>
          <span>/</span>
          <span className="font-semibold text-slate-700">Carrinho</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card className="border-slate-200">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-bold">Produtos no carrinho</h1>
                <Badge variant="secondary">{cartItemsCount} itens</Badge>
              </div>

              {formErrors.cart && (
                <p className="mb-3 text-xs text-destructive">{formErrors.cart}</p>
              )}

              {cartItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  Seu carrinho esta vazio.
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItems.map((item) => (
                    <article
                      key={item.productId}
                      className="grid grid-cols-[84px_1fr] gap-3 rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-1" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-slate-400">Sem imagem</div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-500">{asCurrency(item.unitPrice)} por unidade</p>
                            {item.notes && <p className="mt-1 text-xs text-slate-500">Obs: {item.notes}</p>}
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-red-600"
                            onClick={() => removeItem(item.productId)}
                            aria-label={`Remover ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white">
                            <button
                              type="button"
                              className="grid h-full w-8 place-items-center text-slate-400 hover:text-slate-700"
                              onClick={() =>
                                updateItemQuantity(
                                  item.productId,
                                  item.quantity - 1,
                                  Math.max(1, item.minOrderQuantity),
                                )
                              }
                              aria-label="Diminuir quantidade"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                            <button
                              type="button"
                              className="grid h-full w-8 place-items-center text-slate-400 hover:text-slate-700"
                              onClick={() =>
                                updateItemQuantity(
                                  item.productId,
                                  item.quantity + 1,
                                  Math.max(1, item.minOrderQuantity),
                                )
                              }
                              aria-label="Aumentar quantidade"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>

                          <p className="text-sm font-semibold text-slate-800">
                            {asCurrency(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">Finalizar pedido</h2>
                <p className="text-xs text-slate-500">Revise os dados e confirme o envio.</p>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                {user ? (
                  <span>
                    Conta conectada: <strong>{user.email}</strong>. Este pedido ficara no seu painel de cliente.{' '}
                    <Link to={customerProfilePath} className="font-semibold text-[#1a3a8f] hover:underline">
                      Atualizar perfil
                    </Link>
                    .
                  </span>
                ) : (
                  <span>
                    Quer acompanhar status dos pedidos?{' '}
                    <Link to={customerLoginHref} className="font-semibold text-[#1a3a8f] hover:underline">
                      Entrar ou criar conta
                    </Link>
                    .
                  </span>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold">{asCurrency(orderTotal)}</span>
                </div>
                {minimumOrderValue > 0 && (
                  <p className={`mt-2 text-xs ${orderTotal < minimumOrderValue ? 'text-destructive' : 'text-slate-500'}`}>
                    Pedido minimo: {asCurrency(minimumOrderValue)}
                  </p>
                )}
                {minimumDeliveryValue > 0 && (
                  <p className={`mt-1 text-xs ${form.deliveryMethod === 'entrega' && orderTotal < minimumDeliveryValue ? 'text-destructive' : 'text-slate-500'}`}>
                    Entrega a partir de: {asCurrency(minimumDeliveryValue)}
                  </p>
                )}
                {formErrors.minimum && <p className="mt-2 text-xs text-destructive">{formErrors.minimum}</p>}
                {formErrors.deliveryMinimum && <p className="mt-1 text-xs text-destructive">{formErrors.deliveryMinimum}</p>}
              </div>

              {orderResult && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="font-semibold">
                    Pedido enviado{orderResult.orderNumber ? ` (#${orderResult.orderNumber})` : ''}.
                  </p>
                  <p className="mt-1">Cliente: {orderResult.customerName}</p>
                  <p>Total: {asCurrency(orderResult.total)}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label htmlFor="checkout-name">Nome completo *</Label>
                  <Input
                    id="checkout-name"
                    value={form.name}
                    onChange={(event) => handleFormFieldChange('name', event.target.value)}
                    placeholder="Nome e sobrenome"
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
                </div>

                <div>
                  <Label htmlFor="checkout-phone">Telefone (WhatsApp) *</Label>
                  <PhoneInput
                    id="checkout-phone"
                    value={form.phone}
                    onChange={(value) => handleFormFieldChange('phone', value)}
                    className={formErrors.phone ? 'border-destructive' : ''}
                  />
                  {formErrors.phone && <p className="mt-1 text-xs text-destructive">{formErrors.phone}</p>}
                </div>

                <div>
                  <Label htmlFor="checkout-document">CPF *</Label>
                  <CpfCnpjInput
                    id="checkout-document"
                    value={form.document}
                    onChange={(value) => handleFormFieldChange('document', value)}
                    className={formErrors.document ? 'border-destructive' : ''}
                  />
                  {formErrors.document && <p className="mt-1 text-xs text-destructive">{formErrors.document}</p>}
                </div>

                <div>
                  <Label htmlFor="checkout-email">E-mail *</Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => handleFormFieldChange('email', event.target.value)}
                    placeholder="voce@email.com"
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-destructive">{formErrors.email}</p>}
                </div>

                <div>
                  <Label htmlFor="checkout-delivery-method">Recebimento *</Label>
                  <Select
                    value={form.deliveryMethod}
                    onValueChange={(value) => handleFormFieldChange('deliveryMethod', value)}
                  >
                    <SelectTrigger id="checkout-delivery-method" className={formErrors.deliveryMethod ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrega">Entrega</SelectItem>
                      <SelectItem value="retirada">Retirada no local</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.deliveryMethod && <p className="mt-1 text-xs text-destructive">{formErrors.deliveryMethod}</p>}
                </div>

                {form.deliveryMethod === 'entrega' && user && !savedAddressLoaded && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Carregando endereco salvo...
                  </div>
                )}

                {form.deliveryMethod === 'entrega' && user && hasSavedAddress && !editingSavedAddress ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-medium text-slate-700">Endereco salvo para entrega</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {form.address}, {form.city} - {form.state}, CEP {form.zipCode}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-[#1a3a8f] hover:underline"
                      onClick={() => setEditingSavedAddress(true)}
                    >
                      Alterar endereco
                    </button>
                  </div>
                ) : form.deliveryMethod === 'entrega' ? (
                  <>
                    <div>
                      <Label htmlFor="checkout-address">Endereco *</Label>
                      <Input
                        id="checkout-address"
                        value={form.address}
                        onChange={(event) => handleFormFieldChange('address', event.target.value)}
                        placeholder="Rua, numero e complemento"
                      />
                      {formErrors.address && <p className="mt-1 text-xs text-destructive">{formErrors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="checkout-city">Cidade *</Label>
                        <Input
                          id="checkout-city"
                          value={form.city}
                          onChange={(event) => handleFormFieldChange('city', event.target.value)}
                          placeholder="Cidade"
                        />
                        {formErrors.city && <p className="mt-1 text-xs text-destructive">{formErrors.city}</p>}
                      </div>

                      <div>
                        <Label htmlFor="checkout-state">UF *</Label>
                        <Input
                          id="checkout-state"
                          value={form.state}
                          onChange={(event) => handleFormFieldChange('state', event.target.value.toUpperCase().slice(0, 2))}
                          placeholder="SP"
                        />
                        {formErrors.state && <p className="mt-1 text-xs text-destructive">{formErrors.state}</p>}
                      </div>

                      <div>
                        <Label htmlFor="checkout-zip">CEP *</Label>
                        <Input
                          id="checkout-zip"
                          value={form.zipCode}
                          onChange={(event) => handleFormFieldChange('zipCode', event.target.value)}
                          placeholder="00000-000"
                        />
                        {formErrors.zipCode && <p className="mt-1 text-xs text-destructive">{formErrors.zipCode}</p>}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Retirada selecionada. Endereco de entrega nao sera exigido.
                  </p>
                )}

                <div>
                  <Label htmlFor="checkout-payment">Forma de pagamento *</Label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={(value) => handleFormFieldChange('paymentMethod', value)}
                  >
                    <SelectTrigger id="checkout-payment" className={formErrors.paymentMethod ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="cartao">Cartao</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.paymentMethod && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.paymentMethod}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-[#1a3a8f] hover:bg-[#16337e]" disabled={submitting || cartItems.length === 0}>
                  {submitting ? 'Enviando...' : 'Finalizar pedido'}
                </Button>
              </form>

              {(company.catalog_contact_url || company.whatsapp) && (
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#1a3a8f] bg-white text-sm font-semibold text-[#1a3a8f] hover:bg-[#f3f6ff]"
                  onClick={openContact}
                >
                  <Whatsapp className="h-4 w-4" />
                  WhatsApp
                </button>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={cartItems.length === 0}
                onClick={() => company?.id && clearPublicCart(company.id)}
              >
                Limpar carrinho
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <CatalogFooter company={company} showAccount accountHref={customerOrdersPath} />
    </div>
  );
}
