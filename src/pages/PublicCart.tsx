import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, MessageCircle as Whatsapp, Minus, Plus, Trash2 } from 'lucide-react';
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
import { createPublicPixPayment, type PublicPixPaymentResult } from '@/services/payments';
import { Company, PaymentMethod } from '@/types/database';

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  transferencia: 'Transferencia',
  pix: 'Pix',
  boleto: 'Boleto',
  outro: 'Outro',
};

type OrderResultItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes: string | null;
};

type OrderResultSummary = {
  orderId: string | null;
  orderNumber: number | null;
  customerName: string;
  customerPhone: string;
  customerDocument: string;
  customerEmail: string;
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZipCode: string | null;
  deliveryMethod: 'entrega' | 'retirada';
  total: number;
  paymentMethod: PaymentMethod;
  publicToken: string | null;
  createdAt: string;
  items: OrderResultItem[];
};

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
  const [orderResult, setOrderResult] = useState<OrderResultSummary | null>(null);
  const [pixResult, setPixResult] = useState<PublicPixPaymentResult | null>(null);
  const [pixGenerating, setPixGenerating] = useState(false);
  const [pixErrorMessage, setPixErrorMessage] = useState<string | null>(null);
  const [copiedPixCode, setCopiedPixCode] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<{
    pixAvailable: boolean;
    pixGateway: string | null;
    hasAccess: boolean;
  }>({
    pixAvailable: false,
    pixGateway: null,
    hasAccess: true,
  });
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
    const userId = user?.id;
    if (!userId || !company?.id) {
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
        .eq('user_id', userId)
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
      setPaymentOptions({
        pixAvailable: false,
        pixGateway: null,
        hasAccess: true,
      });
      return;
    }

    let active = true;

    const loadPaymentOptions = async () => {
      const { data, error } = await customerSupabase.rpc('get_company_checkout_payment_options', {
        p_company_id: company.id,
      });

      if (!active) return;

      if (error) {
        setPaymentOptions({
          pixAvailable: false,
          pixGateway: null,
          hasAccess: true,
        });
        return;
      }

      const options = (data || {}) as {
        pix_available?: boolean;
        pix_gateway?: string | null;
        has_access?: boolean;
      };

      setPaymentOptions({
        pixAvailable: Boolean(options.pix_available),
        pixGateway: options.pix_gateway || null,
        hasAccess: options.has_access !== false,
      });
    };

    void loadPaymentOptions();

    return () => {
      active = false;
    };
  }, [company?.id]);

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
  const checkoutBlocked = !paymentOptions.hasAccess;
  const orderTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  useEffect(() => {
    if (form.paymentMethod !== 'pix' || paymentOptions.pixAvailable) return;
    setForm((prev) => ({ ...prev, paymentMethod: '' }));
  }, [form.paymentMethod, paymentOptions.pixAvailable]);

  const openContact = () => {
    if (company?.catalog_contact_url) {
      window.open(company.catalog_contact_url, '_blank');
      return;
    }
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  const buildStoreOrderMessage = (summary: OrderResultSummary) => {
    const paymentLabel = paymentMethodLabels[summary.paymentMethod] || summary.paymentMethod;
    const deliveryLabel = summary.deliveryMethod === 'entrega' ? 'Entrega' : 'Retirada';
    const orderLabel = summary.orderNumber ? `#${summary.orderNumber}` : summary.orderId || '-';
    const orderUrl = summary.publicToken
      ? `${window.location.origin}/pedido/${summary.publicToken}`
      : null;

    const lines: string[] = [
      `Novo pedido no catálogo - ${orderLabel}`,
      '',
      `Cliente: ${summary.customerName}`,
      `Telefone: ${summary.customerPhone}`,
      `CPF: ${summary.customerDocument}`,
      `E-mail: ${summary.customerEmail}`,
      `Recebimento: ${deliveryLabel}`,
      `Pagamento: ${paymentLabel}`,
      '',
      'Produtos:',
      ...summary.items.flatMap((item, index) => {
        const itemLines = [
          `${index + 1}. ${item.name}`,
          `   Qtd: ${item.quantity} | Unit: ${asCurrency(item.unitPrice)} | Total: ${asCurrency(item.total)}`,
        ];
        if (item.notes) {
          itemLines.push(`   Obs: ${item.notes}`);
        }
        return itemLines;
      }),
      '',
      `Total do pedido: ${asCurrency(summary.total)}`,
      `Data/Hora: ${new Date(summary.createdAt).toLocaleString('pt-BR')}`,
    ];

    if (summary.deliveryMethod === 'entrega') {
      lines.push(
        `Endereço: ${summary.customerAddress || '-'}, ${summary.customerCity || '-'} - ${summary.customerState || '-'}, CEP ${summary.customerZipCode || '-'}`,
      );
    }

    if (orderUrl) {
      lines.push(`Acompanhar pedido: ${orderUrl}`);
    }

    return lines.join('\n');
  };

  const buildStoreContactUrl = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    const catalogContactUrl = company?.catalog_contact_url?.trim();

    if (catalogContactUrl) {
      try {
        const parsed = new URL(catalogContactUrl);
        const host = parsed.hostname.toLowerCase();
        const isWhatsappLink = host.includes('wa.me') || host.includes('whatsapp.com');
        if (isWhatsappLink) {
          const phoneFromPath = parsed.pathname.replace(/\D/g, '');
          if (host.includes('wa.me') && phoneFromPath) {
            return `https://wa.me/${phoneFromPath}?text=${encodedMessage}`;
          }
          parsed.searchParams.set('text', message);
          return parsed.toString();
        }
      } catch {
        // ignore invalid URL and fallback to whatsapp field
      }
    }

    const whatsappPhone = company?.whatsapp?.replace(/\D/g, '');
    if (!whatsappPhone) return null;
    return `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;
  };

  const handleSendOrderToStoreContact = () => {
    if (!orderResult) return;
    const message = buildStoreOrderMessage(orderResult);
    const shareUrl = buildStoreContactUrl(message);

    if (!shareUrl) {
      toast({
        title: 'Contato da loja não configurado',
        description: 'Configure o WhatsApp da loja para enviar os detalhes do pedido.',
        variant: 'destructive',
      });
      return;
    }

    window.open(shareUrl, '_blank');
  };

  const handleCopyPixCode = async () => {
    if (!pixResult?.payment_copy_paste) return;
    try {
      await navigator.clipboard.writeText(pixResult.payment_copy_paste);
      setCopiedPixCode(true);
      window.setTimeout(() => setCopiedPixCode(false), 1800);
    } catch {
      toast({
        title: 'Não foi possível copiar o código PIX',
        variant: 'destructive',
      });
    }
  };

  const generatePixCharge = async ({
    orderId,
    publicToken,
    silent = false,
  }: {
    orderId: string;
    publicToken: string;
    silent?: boolean;
  }) => {
    if (!company?.id) return null;

    setPixGenerating(true);
    setPixErrorMessage(null);
    try {
      const pixCharge = await createPublicPixPayment({
        company_id: company.id,
        order_id: orderId,
        public_token: publicToken,
      });
      setPixResult(pixCharge);
      return pixCharge;
    } catch (pixError: unknown) {
      const pixMessage = pixError instanceof Error ? pixError.message : 'Falha ao gerar cobrança PIX.';
      setPixResult(null);
      setPixErrorMessage(pixMessage);
      if (!silent) {
        toast({
          title: 'Pedido criado, mas PIX não foi gerado',
          description: pixMessage,
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setPixGenerating(false);
    }
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

    if (checkoutBlocked) {
      nextErrors.cart = 'Loja com acesso bloqueado no plano atual. Finalização indisponível.';
      setFormErrors(nextErrors);
      return false;
    }

    if (cartItems.length === 0) {
      nextErrors.cart = 'Seu carrinho está vazio.';
    }

    if (!form.name.trim()) {
      nextErrors.name = 'Informe o nome completo.';
    }

    if (!validatePhone(form.phone)) {
      nextErrors.phone = 'Telefone inválido.';
    }

    const documentDigits = normalizeDigits(form.document);
    if (documentDigits.length !== 11 || !validateCpf(form.document)) {
      nextErrors.document = 'CPF inválido.';
    }

    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Informe um e-mail valido.';
    }

    if (requiresAddressInput) {
      if (!form.address.trim()) {
        nextErrors.address = 'Informe o endereço para entrega/contato.';
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
    } else if (form.paymentMethod === 'pix' && !paymentOptions.pixAvailable) {
      nextErrors.paymentMethod = 'PIX indisponível para esta loja.';
    }

    if (minimumOrderValue > 0 && orderTotal < minimumOrderValue) {
      nextErrors.minimum = `O valor mínimo para pedidos ? ${asCurrency(minimumOrderValue)}.`;
    }

    if (form.deliveryMethod === 'entrega' && minimumDeliveryValue > 0 && orderTotal < minimumDeliveryValue) {
      nextErrors.deliveryMinimum = `Entrega disponivel apenas a partir de ${asCurrency(minimumDeliveryValue)}.`;
    }

    const invalidMinQuantity = cartItems.find((item) => item.quantity < Math.max(1, item.minOrderQuantity));
    if (invalidMinQuantity) {
      nextErrors.cart = `O produto "${invalidMinQuantity.name}" exige no mínimo ${invalidMinQuantity.minOrderQuantity} unidade(s).`;
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company) return;
    if (!validateCheckout()) return;

    const selectedPaymentMethod = form.paymentMethod;
    const customerName = form.name.trim();
    const customerPhone = normalizeDigits(form.phone);
    const customerDocument = normalizeDigits(form.document);
    const customerEmail = form.email.trim();
    const customerAddress = form.deliveryMethod === 'entrega' ? form.address.trim() : '';
    const customerCity = form.deliveryMethod === 'entrega' ? form.city.trim() : '';
    const customerState = form.deliveryMethod === 'entrega' ? form.state.trim() : '';
    const customerZipCode = form.deliveryMethod === 'entrega' ? normalizeDigits(form.zipCode) : '';
    const createdAt = new Date().toISOString();
    const orderItemsSummary: OrderResultItem[] = cartItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.unitPrice * item.quantity,
      notes: item.notes || null,
    }));

    setSubmitting(true);
    setOrderResult(null);
    setPixResult(null);
    setPixErrorMessage(null);
    setPixGenerating(false);
    setCopiedPixCode(false);

    const { data, error } = await customerSupabase.rpc('create_public_order', {
      p_company_id: company.id,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_document: customerDocument,
      p_customer_email: customerEmail,
      p_customer_address: customerAddress,
      p_customer_city: customerCity,
      p_customer_state: customerState,
      p_customer_zip_code: customerZipCode,
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
        error.message.includes('Valor mínimo do pedido');
      const isMinQuantityError =
        error.message.includes('Minimum quantity not reached') ||
        error.message.includes('Quantidade mínima não atingida');
      const isPixUnavailable =
        error.message.includes('PIX unavailable') ||
        error.message.includes('PIX indisponível');

      const errorMessage = isMinOrderError
        ? `O valor mínimo para pedidos ? ${asCurrency(minimumOrderValue)}.`
        : isMinQuantityError
          ? 'Existe item abaixo da quantidade minima permitida.'
          : isPixUnavailable
            ? 'PIX indisponível para esta loja no momento.'
          : error.message;

      if (isMinOrderError) {
        setFormErrors((prev) => ({ ...prev, minimum: errorMessage }));
      }
      if (isMinQuantityError) {
        setFormErrors((prev) => ({ ...prev, cart: errorMessage }));
      }
      if (isPixUnavailable) {
        setFormErrors((prev) => ({ ...prev, paymentMethod: errorMessage }));
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
    const publicToken =
      (data as { public_token?: string } | null)?.public_token || null;
    const orderId =
      (data as { order_id?: string } | null)?.order_id || '';

    if (selectedPaymentMethod === 'pix') {
      if (orderId && publicToken) {
        await generatePixCharge({ orderId, publicToken });
      } else {
        setPixErrorMessage('Pedido criado, mas não foi possível iniciar o pagamento PIX.');
      }
    }

    setOrderResult({
      orderId: orderId || null,
      orderNumber: resolvedOrderNumber,
      customerName,
      customerPhone,
      customerDocument,
      customerEmail,
      customerAddress: customerAddress || null,
      customerCity: customerCity || null,
      customerState: customerState || null,
      customerZipCode: customerZipCode || null,
      deliveryMethod: form.deliveryMethod,
      total: orderTotal,
      paymentMethod: selectedPaymentMethod as PaymentMethod,
      publicToken,
      createdAt,
      items: orderItemsSummary,
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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Catálogo não encontrado</h1>
          <p className="text-slate-500 mb-4">Não foi possível carregar os dados da empresa.</p>
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
          <Link to={catalogHref} className="hover:text-slate-700">Catálogo</Link>
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
                  Seu carrinho está vazio.
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
                    Pedido mínimo: {asCurrency(minimumOrderValue)}
                  </p>
                )}
                {minimumDeliveryValue > 0 && (
                  <p className={`mt-1 text-xs ${form.deliveryMethod === 'entrega' && orderTotal < minimumDeliveryValue ? 'text-destructive' : 'text-slate-500'}`}>
                    Entrega a partir de: {asCurrency(minimumDeliveryValue)}
                  </p>
                )}
                {checkoutBlocked && (
                  <p className="mt-2 text-xs text-destructive">
                    Loja com assinatura/bloqueio ativo: novos pedidos estão temporariamente indisponíveis.
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
                  {orderResult.publicToken && (
                    <p className="mt-2 text-xs">
                      Acompanhe em{' '}
                      <Link to={`/pedido/${orderResult.publicToken}`} className="font-semibold underline">
                        /pedido/{orderResult.publicToken}
                      </Link>
                    </p>
                  )}
                  {(company.catalog_contact_url || company.whatsapp) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full gap-2 border-emerald-400 bg-white text-emerald-800 hover:bg-emerald-100"
                      onClick={handleSendOrderToStoreContact}
                    >
                      <Whatsapp className="h-4 w-4" />
                      Enviar detalhes para a loja
                    </Button>
                  )}
                </div>
              )}

              {orderResult?.paymentMethod === 'pix' && !pixResult && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Pagamento PIX</p>
                  <p className="text-xs">
                    {pixGenerating
                      ? 'Gerando QR Code PIX...'
                      : pixErrorMessage || 'Gerando cobrança PIX para este pedido.'}
                  </p>
                  {orderResult.orderId && orderResult.publicToken && !pixGenerating && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-amber-300 text-amber-900"
                      onClick={() =>
                        void generatePixCharge({
                          orderId: orderResult.orderId as string,
                          publicToken: orderResult.publicToken as string,
                        })
                      }
                    >
                      Gerar QR Code PIX
                    </Button>
                  )}
                </div>
              )}

              {pixResult && (
                <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <p className="font-semibold">Pagamento PIX gerado</p>
                  <p className="text-xs">Valor do PIX: {asCurrency(Number(pixResult.amount || 0))}</p>
                  {pixResult.payment_qr_code && (
                    <div className="flex justify-center">
                      <img
                        src={pixResult.payment_qr_code}
                        alt="QR Code PIX"
                        className="h-44 w-44 rounded-md border border-sky-200 bg-white p-2"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs">Código copia e cola</Label>
                    <Input value={pixResult.payment_copy_paste} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-sky-300 text-sky-800"
                      onClick={handleCopyPixCode}
                    >
                      <Copy className="h-4 w-4" />
                      {copiedPixCode ? 'Código copiado' : 'Copiar código PIX'}
                    </Button>
                  </div>
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
                    Carregando endereço salvo...
                  </div>
                )}

                {form.deliveryMethod === 'entrega' && user && hasSavedAddress && !editingSavedAddress ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-medium text-slate-700">Endereço salvo para entrega</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {form.address}, {form.city} - {form.state}, CEP {form.zipCode}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-[#1a3a8f] hover:underline"
                      onClick={() => setEditingSavedAddress(true)}
                    >
                      Alterar endereço
                    </button>
                  </div>
                ) : form.deliveryMethod === 'entrega' ? (
                  <>
                    <div>
                      <Label htmlFor="checkout-address">Endereço *</Label>
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
                    Retirada selecionada. Endereço de entrega não será exigido.
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
                      {paymentOptions.pixAvailable && <SelectItem value="pix">Pix</SelectItem>}
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  {!paymentOptions.pixAvailable && (
                    <p className="mt-1 text-xs text-slate-500">
                      PIX indisponível: configure o gateway completo na loja.
                    </p>
                  )}
                  {formErrors.paymentMethod && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.paymentMethod}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-[#1a3a8f] hover:bg-[#16337e]" disabled={submitting || cartItems.length === 0 || checkoutBlocked}>
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
