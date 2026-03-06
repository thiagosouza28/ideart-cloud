import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle as Whatsapp, Minus, Plus, Trash2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  upsertPublicCartItem,
} from '@/lib/public-cart';
import {
  calculateEstimatedDeliveryInfo,
  formatDatePtBr,
  normalizeProductionTimeDays,
  resolveCompanyDeliveryTimeDays,
} from '@/lib/productionTime';
import { buildSystemStorageViewerUrl, ensurePublicStorageUrl } from '@/lib/storage';
import { createPublicPixPayment, type PublicPixPaymentResult } from '@/services/payments';
import { Company, PaymentMethod } from '@/types/database';

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const PERSONALIZED_REFERENCE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const PERSONALIZED_REFERENCE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  credito: 'Cartao de credito',
  debito: 'Cartao de debito',
  transferencia: 'Transferencia',
  pix: 'Pix',
  boleto: 'Boleto',
  outro: 'Outro',
};

const CHECKOUT_STEPS = [
  { key: 'cart', label: 'Carrinho' },
  { key: 'customer', label: 'Dados do cliente' },
  { key: 'payment', label: 'Pagamento' },
  { key: 'review', label: 'Finalizacao' },
] as const;

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
  orderNotes: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZipCode: string | null;
  deliveryMethod: 'entrega' | 'retirada';
  total: number;
  productionTimeDaysUsed: number | null;
  estimatedDeliveryDate: string | null;
  paymentMethod: PaymentMethod;
  publicToken: string | null;
  createdAt: string;
  items: OrderResultItem[];
};

type FormErrors = {
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
  const [currentStep, setCurrentStep] = useState(0);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
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
  const [uploadingReferenceByProduct, setUploadingReferenceByProduct] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: '',
    phone: '',
    document: '',
    email: '',
    orderNotes: '',
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
  const deliveryMinimumToApply = Math.max(minimumOrderValue, minimumDeliveryValue);
  const checkoutBlocked = !paymentOptions.hasAccess;
  const requiresAddressInput = form.deliveryMethod === 'entrega' && (!user || !hasSavedAddress || editingSavedAddress);
  const isLoggedCustomer = Boolean(user);
  const orderTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );
  const companyDeliveryTimeDays = useMemo(
    () => resolveCompanyDeliveryTimeDays(company),
    [company],
  );
  const productionTimeDaysUsed = useMemo(() => {
    let maxDays: number | null = null;
    cartItems.forEach((item) => {
      const itemDays = normalizeProductionTimeDays(item.productionTimeDays);
      if (itemDays === null) return;
      maxDays = maxDays === null ? itemDays : Math.max(maxDays, itemDays);
    });
    return maxDays;
  }, [cartItems]);
  const estimatedDeliveryInfo = useMemo(
    () =>
      calculateEstimatedDeliveryInfo({
        productionTimeDays: productionTimeDaysUsed,
        companyDeliveryDays: companyDeliveryTimeDays,
      }),
    [productionTimeDaysUsed, companyDeliveryTimeDays],
  );

  const currentStepConfig = CHECKOUT_STEPS[currentStep] ?? CHECKOUT_STEPS[0];
  const currentStepKey = currentStepConfig.key;
  const isCartStep = currentStepKey === 'cart';
  const isCustomerStep = currentStepKey === 'customer';
  const isPaymentStep = currentStepKey === 'payment';
  const isReviewStep = currentStepKey === 'review';
  const canEditCart = isCartStep && !orderResult;

  useEffect(() => {
    if (form.paymentMethod !== 'pix' || paymentOptions.pixAvailable) return;
    setForm((prev) => ({ ...prev, paymentMethod: '' }));
  }, [form.paymentMethod, paymentOptions.pixAvailable]);

  useEffect(() => {
    if (!orderResult && cartItems.length === 0 && currentStep > 0) {
      setCurrentStep(0);
    }
  }, [cartItems.length, currentStep, orderResult]);

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
    const orderUrl = summary.publicToken ? `${window.location.origin}/pedido/${summary.publicToken}` : null;

    const lines: string[] = [
      `Novo pedido no catalogo - ${orderLabel}`,
      '',
      `Cliente: ${summary.customerName}`,
      `Telefone: ${summary.customerPhone}`,
      `CPF: ${summary.customerDocument}`,
      `E-mail: ${summary.customerEmail}`,
      `Recebimento: ${deliveryLabel}`,
      `Pagamento: ${paymentLabel}`,
      ...(summary.orderNotes ? [`Observacoes: ${summary.orderNotes}`] : []),
      '',
      'Produtos:',
      ...summary.items.flatMap((item, index) => {
        const itemLines = [
          `${index + 1}. ${item.name}`,
          `   Qtd: ${item.quantity} | Unit: ${asCurrency(item.unitPrice)} | Total: ${asCurrency(item.total)}`,
        ];
        if (item.notes) itemLines.push(`   Obs: ${item.notes}`);
        return itemLines;
      }),
      '',
      ...(summary.productionTimeDaysUsed !== null
        ? [`Tempo de producao: ${summary.productionTimeDaysUsed} ${summary.productionTimeDaysUsed === 1 ? 'dia' : 'dias'}`]
        : []),
      ...(summary.estimatedDeliveryDate
        ? [`Previsao de entrega: ${formatDatePtBr(summary.estimatedDeliveryDate)}`]
        : []),
      `Total do pedido: ${asCurrency(summary.total)}`,
      `Data/Hora: ${new Date(summary.createdAt).toLocaleString('pt-BR')}`,
    ];

    if (summary.deliveryMethod === 'entrega') {
      lines.push(
        `Endereco: ${summary.customerAddress || '-'}, ${summary.customerCity || '-'} - ${summary.customerState || '-'}, CEP ${summary.customerZipCode || '-'}`,
      );
    }
    if (orderUrl) lines.push(`Acompanhar pedido: ${orderUrl}`);
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
        // Ignore invalid URL and fallback to company whatsapp.
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
        title: 'Contato da loja nao configurado',
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
        title: 'Nao foi possivel copiar o codigo PIX',
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
      const pixMessage = pixError instanceof Error ? pixError.message : 'Falha ao gerar cobranca PIX.';
      setPixResult(null);
      setPixErrorMessage(pixMessage);
      if (!silent) {
        toast({
          title: 'Pedido criado, mas PIX nao foi gerado',
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
    if (!orderResult && currentStep > 0) {
      setCurrentStep((prev) => Math.max(0, prev - 1));
      return;
    }
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

  const handleReferenceFileUpload = async (item: PublicCartItem, file: File) => {
    if (!company?.id) return;

    if (!PERSONALIZED_REFERENCE_MIME_TYPES.has(file.type)) {
      toast({
        title: 'Arquivo invalido',
        description: 'Envie somente JPG, PNG, WEBP ou PDF.',
        variant: 'destructive',
      });
      return;
    }

    const uploadClient = user ? customerSupabase : publicSupabase;
    const safeName = (file.name || 'referencia').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `public-catalog/${company.id}/${item.productId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}-${safeName}`;

    setUploadingReferenceByProduct((prev) => ({ ...prev, [item.productId]: true }));
    const { error: uploadError } = await uploadClient.storage.from('order-art-files').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
      cacheControl: '3600',
    });
    setUploadingReferenceByProduct((prev) => ({ ...prev, [item.productId]: false }));

    if (uploadError) {
      toast({
        title: 'Erro ao enviar referencia',
        description: 'Nao foi possivel enviar o arquivo agora.',
        variant: 'destructive',
      });
      return;
    }

    upsertPublicCartItem(
      company.id,
      {
        ...item,
        referenceFilePath: path,
        referenceFileName: file.name || safeName,
        referenceFileType: file.type || null,
      },
      'replace',
    );

    toast({
      title: 'Arquivo anexado',
      description: `Referencia anexada para ${item.name}.`,
    });
  };

  const clearReferenceFile = (item: PublicCartItem) => {
    if (!company?.id) return;

    upsertPublicCartItem(
      company.id,
      {
        ...item,
        referenceFilePath: null,
        referenceFileName: null,
        referenceFileType: null,
      },
      'replace',
    );
  };

  const handleFormFieldChange = (
    field:
      | 'name'
      | 'phone'
      | 'document'
      | 'email'
      | 'orderNotes'
      | 'address'
      | 'city'
      | 'state'
      | 'zipCode'
      | 'deliveryMethod'
      | 'paymentMethod',
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

  const validateCartStep = () => {
    const nextErrors: FormErrors = {};

    if (checkoutBlocked) {
      nextErrors.cart = 'Loja com acesso bloqueado no plano atual. Finalizacao indisponivel.';
    } else if (cartItems.length === 0) {
      nextErrors.cart = 'Seu carrinho esta vazio.';
    }

    if (minimumOrderValue > 0 && orderTotal < minimumOrderValue) {
      nextErrors.minimum = `O valor minimo para pedidos e ${asCurrency(minimumOrderValue)}.`;
    }

    const invalidMinQuantity = cartItems.find((item) => item.quantity < Math.max(1, item.minOrderQuantity));
    if (invalidMinQuantity) {
      nextErrors.cart = `O produto "${invalidMinQuantity.name}" exige no minimo ${invalidMinQuantity.minOrderQuantity} unidade(s).`;
    }

    setFormErrors((prev) => ({
      ...prev,
      cart: nextErrors.cart,
      minimum: nextErrors.minimum,
      deliveryMinimum: undefined,
    }));

    return !nextErrors.cart && !nextErrors.minimum;
  };

  const validateCustomerStep = () => {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) nextErrors.name = 'Informe o nome completo.';

    const documentDigits = normalizeDigits(form.document);
    if (documentDigits.length !== 11 || !validateCpf(form.document)) {
      nextErrors.document = 'CPF invalido.';
    }

    if (!isLoggedCustomer) {
      if (!validatePhone(form.phone)) nextErrors.phone = 'Telefone invalido.';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        nextErrors.email = 'Informe um e-mail valido.';
      }
    } else {
      if (!validatePhone(form.phone)) {
        nextErrors.phone = 'Telefone nao encontrado na conta. Atualize seu perfil para continuar.';
      }
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        nextErrors.email = 'E-mail nao encontrado na conta. Atualize seu perfil para continuar.';
      }
    }

    if (requiresAddressInput) {
      if (!form.address.trim()) nextErrors.address = 'Informe o endereco para entrega/contato.';
      if (!form.city.trim()) nextErrors.city = 'Informe a cidade.';
      if (!form.state.trim() || form.state.trim().length < 2) nextErrors.state = 'Informe o estado (UF).';
      if (normalizeDigits(form.zipCode).length < 8) nextErrors.zipCode = 'Informe um CEP valido.';
    }

    if (form.deliveryMethod === 'entrega' && deliveryMinimumToApply > 0 && orderTotal < deliveryMinimumToApply) {
      nextErrors.deliveryMinimum = `Entrega disponivel apenas a partir de ${asCurrency(deliveryMinimumToApply)}.`;
    }

    setFormErrors((prev) => ({
      ...prev,
      name: nextErrors.name,
      phone: nextErrors.phone,
      document: nextErrors.document,
      email: nextErrors.email,
      address: nextErrors.address,
      city: nextErrors.city,
      state: nextErrors.state,
      zipCode: nextErrors.zipCode,
      deliveryMinimum: nextErrors.deliveryMinimum,
    }));

    return !nextErrors.name && !nextErrors.phone && !nextErrors.document && !nextErrors.email && !nextErrors.address && !nextErrors.city && !nextErrors.state && !nextErrors.zipCode && !nextErrors.deliveryMinimum;
  };

  const validatePaymentStep = () => {
    let paymentError: string | undefined;
    if (!form.paymentMethod) {
      paymentError = 'Selecione a forma de pagamento.';
    } else if (form.paymentMethod === 'pix' && !paymentOptions.pixAvailable) {
      paymentError = 'PIX indisponivel para esta loja.';
    }

    setFormErrors((prev) => ({
      ...prev,
      paymentMethod: paymentError,
    }));

    return !paymentError;
  };

  const validateCheckout = () => {
    const cartOk = validateCartStep();
    const customerOk = validateCustomerStep();
    const paymentOk = validatePaymentStep();
    return cartOk && customerOk && paymentOk;
  };

  const goToStep = (targetStep: number) => {
    if (targetStep < 0 || targetStep >= CHECKOUT_STEPS.length) return;
    if (targetStep <= currentStep) {
      setCurrentStep(targetStep);
      return;
    }

    let valid = true;
    for (let step = currentStep; step < targetStep; step += 1) {
      if (step === 0) valid = valid && validateCartStep();
      if (step === 1) valid = valid && validateCustomerStep();
      if (step === 2) valid = valid && validatePaymentStep();
      if (!valid) return;
    }

    setCurrentStep(targetStep);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company) return;
    if (!validateCheckout()) return;

    const userMetadata = (user?.user_metadata || {}) as Record<string, unknown>;
    const metadataName = typeof userMetadata.full_name === 'string' ? userMetadata.full_name : '';
    const metadataPhone = typeof userMetadata.phone === 'string' ? userMetadata.phone : '';
    const metadataDocument = typeof userMetadata.cpf === 'string' ? userMetadata.cpf : '';
    const selectedPaymentMethod = form.paymentMethod;
    const customerName = (form.name.trim() || metadataName || '').trim();
    const customerPhone = normalizeDigits(form.phone || user?.phone || metadataPhone || '');
    const customerDocument = normalizeDigits(form.document || metadataDocument || '');
    const customerEmail = (form.email.trim() || user?.email || '').trim();
    const orderNotes = form.orderNotes.trim();
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
      p_items: cartItems.map((item, index) => {
        const mergedNotes = [item.notes || null, index === 0 && orderNotes ? `Obs. do pedido: ${orderNotes}` : null]
          .filter(Boolean)
          .join('\n');
        return {
          product_id: item.productId,
          quantity: item.quantity,
          notes: mergedNotes || null,
          reference_file_path: item.referenceFilePath || null,
          reference_file_name: item.referenceFileName || null,
          reference_file_type: item.referenceFileType || null,
          is_personalized: item.isPersonalized === true,
        };
      }),
    });

    if (error) {
      const isMinOrderError =
        error.message.includes('Minimum order value') ||
        error.message.includes('Valor minimo do pedido');
      const isMinQuantityError =
        error.message.includes('Minimum quantity not reached') ||
        error.message.includes('Quantidade minima nao atingida');
      const isPixUnavailable =
        error.message.includes('PIX unavailable') ||
        error.message.includes('PIX indisponivel');
      const isInvalidReferenceType =
        error.message.includes('Invalid reference file type') ||
        error.message.includes('tipo de arquivo');

      const errorMessage = isMinOrderError
        ? `O valor minimo para pedidos e ${asCurrency(minimumOrderValue)}.`
        : isMinQuantityError
          ? 'Existe item abaixo da quantidade minima permitida.'
          : isPixUnavailable
            ? 'PIX indisponivel para esta loja no momento.'
            : isInvalidReferenceType
              ? 'Tipo de arquivo invalido. Use JPG, PNG, WEBP ou PDF para produtos personalizados.'
              : error.message;

      if (isMinOrderError) setFormErrors((prev) => ({ ...prev, minimum: errorMessage }));
      if (isMinQuantityError || isInvalidReferenceType) setFormErrors((prev) => ({ ...prev, cart: errorMessage }));
      if (isPixUnavailable) setFormErrors((prev) => ({ ...prev, paymentMethod: errorMessage }));

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
    const publicToken = (data as { public_token?: string } | null)?.public_token || null;
    const orderId = (data as { order_id?: string } | null)?.order_id || '';
    const responseProductionTimeDays = normalizeProductionTimeDays(
      (data as { production_time_days_used?: number | null } | null)?.production_time_days_used,
    );
    const responseEstimatedDeliveryDateRaw =
      (data as { estimated_delivery_date?: string | null } | null)?.estimated_delivery_date || null;
    const responseEstimatedDeliveryDate =
      typeof responseEstimatedDeliveryDateRaw === 'string' && responseEstimatedDeliveryDateRaw.trim()
        ? responseEstimatedDeliveryDateRaw
        : null;
    const resolvedProductionTimeDaysUsed = responseProductionTimeDays ?? productionTimeDaysUsed;
    const resolvedEstimatedDeliveryDate = responseEstimatedDeliveryDate || estimatedDeliveryInfo?.isoDate || null;

    if (selectedPaymentMethod === 'pix') {
      if (orderId && publicToken) {
        await generatePixCharge({ orderId, publicToken });
      } else {
        setPixErrorMessage('Pedido criado, mas nao foi possivel iniciar o pagamento PIX.');
      }
    }

    setOrderResult({
      orderId: orderId || null,
      orderNumber: resolvedOrderNumber,
      customerName,
      customerPhone,
      customerDocument,
      customerEmail,
      orderNotes: orderNotes || null,
      customerAddress: customerAddress || null,
      customerCity: customerCity || null,
      customerState: customerState || null,
      customerZipCode: customerZipCode || null,
      deliveryMethod: form.deliveryMethod,
      total: orderTotal,
      productionTimeDaysUsed: resolvedProductionTimeDaysUsed,
      estimatedDeliveryDate: resolvedEstimatedDeliveryDate,
      paymentMethod: selectedPaymentMethod as PaymentMethod,
      publicToken,
      createdAt,
      items: orderItemsSummary,
    });

    setForm((prev) => ({
      ...prev,
      paymentMethod: '',
      orderNotes: '',
    }));

    if (user && form.deliveryMethod === 'entrega') {
      setHasSavedAddress(true);
      setEditingSavedAddress(false);
    }

    clearPublicCart(company.id);
    setCurrentStep(3);
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

  const reviewItems: OrderResultItem[] = orderResult
    ? orderResult.items
    : cartItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.unitPrice * item.quantity,
        notes: item.notes || null,
      }));

  const reviewTotal = orderResult?.total ?? orderTotal;
  const reviewProductionTimeDays = orderResult?.productionTimeDaysUsed ?? productionTimeDaysUsed;
  const reviewEstimatedDeliveryDate = orderResult?.estimatedDeliveryDate || estimatedDeliveryInfo?.isoDate || null;
  const selectedPaymentLabel = form.paymentMethod ? paymentMethodLabels[form.paymentMethod as PaymentMethod] || form.paymentMethod : '-';
  const personalizedItemsCount = cartItems.filter((item) => item.isPersonalized).length;
  const personalizedItemsWithReference = cartItems.filter((item) => item.isPersonalized && Boolean(item.referenceFilePath)).length;
  const personalizedItemsMissingReference = Math.max(0, personalizedItemsCount - personalizedItemsWithReference);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={company}
        subtitle="Pedido do catalogo"
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

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {CHECKOUT_STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isDone = index < currentStep;
              const isDisabled = submitting || (orderResult ? index !== currentStep : index > currentStep + 1);

              return (
                <button
                  key={step.key}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    isActive
                      ? 'border-[#1a3a8f] bg-[#eef3ff] text-[#1a3a8f]'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                  disabled={isDisabled}
                  onClick={() => goToStep(index)}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Etapa {index + 1}</p>
                  <p className="text-xs font-medium">{step.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className={isReviewStep ? 'mx-auto max-w-2xl' : 'grid gap-6 lg:grid-cols-[1.6fr_1fr]'}>
          {!isReviewStep && (
            <Card className="border-slate-200">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-bold">Produtos no carrinho</h1>
                <Badge variant="secondary">{cartItemsCount} itens</Badge>
              </div>

              {formErrors.cart && <p className="mb-3 text-xs text-destructive">{formErrors.cart}</p>}

              {cartItems.length === 0 ? (
                <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  <p>Seu carrinho esta vazio.</p>
                  <Button
                    type="button"
                    className="bg-[#1a3a8f] hover:bg-[#16337e]"
                    onClick={() => navigate(catalogHref)}
                  >
                    Adicionar produtos
                  </Button>
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
                            {typeof item.productionTimeDays === 'number' && item.productionTimeDays >= 0 && (
                              <p className="mt-1 text-xs text-sky-700">
                                Tempo de producao: {item.productionTimeDays}{' '}
                                {item.productionTimeDays === 1 ? 'dia' : 'dias'}
                              </p>
                            )}

                            {isCustomerStep && item.isPersonalized && (
                              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                                <p className="text-[11px] font-medium text-amber-800">
                                  Produto personalizado: se desejar, anexe a arte/modelo de referencia.
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100">
                                    {uploadingReferenceByProduct[item.productId] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="h-3.5 w-3.5" />
                                    )}
                                    {item.referenceFilePath ? 'Trocar arquivo' : 'Anexar arquivo'}
                                    <input
                                      type="file"
                                      accept={PERSONALIZED_REFERENCE_ACCEPT}
                                      className="hidden"
                                      disabled={uploadingReferenceByProduct[item.productId]}
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.currentTarget.value = '';
                                        if (file) void handleReferenceFileUpload(item, file);
                                      }}
                                    />
                                  </label>
                                  {item.referenceFilePath && (
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                                      onClick={() => clearReferenceFile(item)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Remover
                                    </button>
                                  )}
                                </div>
                                {item.referenceFilePath ? (
                                  <a
                                    href={buildSystemStorageViewerUrl('order-art-files', item.referenceFilePath) || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-900 underline"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {item.referenceFileName || 'Ver referencia anexada'}
                                  </a>
                                ) : (
                                  <p className="mt-2 text-[11px] text-amber-700">Nenhum arquivo anexado ainda.</p>
                                )}
                              </div>
                            )}
                          </div>

                          {canEditCart && (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-red-600"
                              onClick={() => removeItem(item.productId)}
                              aria-label={`Remover ${item.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          {canEditCart ? (
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
                          ) : (
                            <p className="text-xs text-slate-500">Quantidade: {item.quantity}</p>
                          )}

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
          )}

          <Card className="border-slate-200">
            <CardContent className="space-y-4 p-4 sm:p-6">
              {isCartStep && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Etapa 1: Carrinho</h2>
                    <p className="text-xs text-slate-500">Revise os itens e clique em continuar.</p>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-medium">{asCurrency(orderTotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-600">Total</span>
                      <span className="font-semibold">{asCurrency(orderTotal)}</span>
                    </div>
                    {minimumOrderValue > 0 && (
                      <p className={`mt-2 text-xs ${orderTotal < minimumOrderValue ? 'text-destructive' : 'text-slate-500'}`}>
                        Pedido minimo: {asCurrency(minimumOrderValue)}
                      </p>
                    )}
                    {deliveryMinimumToApply > 0 && (
                      <p className="mt-1 text-xs text-slate-500">Entrega a partir de: {asCurrency(deliveryMinimumToApply)}</p>
                    )}
                    {productionTimeDaysUsed !== null && (
                      <p className="mt-1 text-xs text-slate-500">
                        Tempo de producao: {productionTimeDaysUsed}{' '}
                        {productionTimeDaysUsed === 1 ? 'dia' : 'dias'}
                      </p>
                    )}
                    {estimatedDeliveryInfo?.isoDate && (
                      <p className="mt-1 text-xs text-slate-500">
                        Previsao de entrega: {formatDatePtBr(estimatedDeliveryInfo.isoDate)}
                      </p>
                    )}
                    {checkoutBlocked && (
                      <p className="mt-2 text-xs text-destructive">
                        Loja com assinatura/bloqueio ativo: novos pedidos estao temporariamente indisponiveis.
                      </p>
                    )}
                    {formErrors.minimum && <p className="mt-2 text-xs text-destructive">{formErrors.minimum}</p>}
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-[#1a3a8f] hover:bg-[#16337e]"
                    disabled={cartItems.length === 0 || checkoutBlocked}
                    onClick={() => goToStep(1)}
                  >
                    Continuar
                  </Button>

                  {cartItems.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => navigate(catalogHref)}
                    >
                      Adicionar produtos
                    </Button>
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
                </>
              )}

              {isCustomerStep && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Etapa 2: Dados do cliente</h2>
                    <p className="text-xs text-slate-500">Preencha os dados para contato e entrega.</p>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    {user ? (
                      <span>
                        Conta conectada: <strong>{user.email}</strong>. Dados foram preenchidos automaticamente quando disponiveis.{' '}
                        <Link to={customerProfilePath} className="font-semibold text-[#1a3a8f] hover:underline">
                          Atualizar perfil
                        </Link>
                        .
                      </span>
                    ) : (
                      <span>
                        <Link to={customerLoginHref} className="font-semibold text-[#1a3a8f] hover:underline">
                          Entrar ou criar conta
                        </Link>{' '}
                        para preencher dados automaticamente.
                      </span>
                    )}
                  </div>

                  {personalizedItemsCount > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-semibold">
                        Produtos personalizados: {personalizedItemsCount}
                      </p>
                      <p className="mt-1">
                        O anexo de arte/modelo e opcional. Voce pode enviar agora ou finalizar sem anexo.
                      </p>
                      <p className="mt-1 text-amber-800">
                        Arquivos anexados: {personalizedItemsWithReference}/{personalizedItemsCount}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {isLoggedCustomer ? (
                      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div>
                          <Label htmlFor="checkout-name-readonly">Nome completo</Label>
                          <Input id="checkout-name-readonly" value={form.name} readOnly disabled />
                          {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
                        </div>

                        <div>
                          <Label htmlFor="checkout-document-readonly">CPF</Label>
                          <Input id="checkout-document-readonly" value={form.document} readOnly disabled />
                          {formErrors.document && <p className="mt-1 text-xs text-destructive">{formErrors.document}</p>}
                        </div>

                        {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
                        {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}

                        <p className="text-[11px] text-slate-500">
                          Para alterar os dados da conta, acesse{' '}
                          <Link to={customerProfilePath} className="font-semibold text-[#1a3a8f] hover:underline">
                            meu perfil
                          </Link>
                          .
                        </p>
                      </div>
                    ) : (
                      <>
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
                          <Label htmlFor="checkout-phone">Telefone / WhatsApp *</Label>
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
                      </>
                    )}

                    <div>
                      <Label htmlFor="checkout-order-notes">Observacoes do pedido</Label>
                      <Textarea
                        id="checkout-order-notes"
                        value={form.orderNotes}
                        onChange={(event) => handleFormFieldChange('orderNotes', event.target.value)}
                        rows={3}
                        placeholder="Ex.: horario de retirada, referencia da entrega, detalhes gerais."
                      />
                    </div>

                    <div>
                      <Label htmlFor="checkout-delivery-method">Recebimento *</Label>
                      <Select
                        value={form.deliveryMethod}
                        onValueChange={(value) => handleFormFieldChange('deliveryMethod', value)}
                      >
                        <SelectTrigger id="checkout-delivery-method">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrega">Entrega</SelectItem>
                          <SelectItem value="retirada">Retirada no local</SelectItem>
                        </SelectContent>
                      </Select>
                      {formErrors.deliveryMethod && <p className="mt-1 text-xs text-destructive">{formErrors.deliveryMethod}</p>}
                      {formErrors.deliveryMinimum && (
                        <p className="mt-1 text-xs text-destructive">{formErrors.deliveryMinimum}</p>
                      )}
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
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={() => goToStep(0)}>
                      Voltar
                    </Button>
                    <Button type="button" className="bg-[#1a3a8f] hover:bg-[#16337e]" onClick={() => goToStep(2)}>
                      Continuar
                    </Button>
                  </div>
                </>
              )}

              {isPaymentStep && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Etapa 3: Pagamento</h2>
                    <p className="text-xs text-slate-500">Escolha como deseja pagar.</p>
                  </div>

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
                        <SelectItem value="cartao">Cartao</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    {!paymentOptions.pixAvailable && (
                      <p className="mt-1 text-xs text-slate-500">PIX indisponivel: configure o gateway completo na loja.</p>
                    )}
                    {formErrors.paymentMethod && <p className="mt-1 text-xs text-destructive">{formErrors.paymentMethod}</p>}
                  </div>

                  {form.paymentMethod === 'pix' && (
                    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                      O QR Code e o codigo copia e cola do PIX serao gerados apos confirmar o pedido na etapa final.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={() => goToStep(1)}>
                      Voltar
                    </Button>
                    <Button type="button" className="bg-[#1a3a8f] hover:bg-[#16337e]" onClick={() => goToStep(3)}>
                      Continuar
                    </Button>
                  </div>
                </>
              )}

              {isReviewStep && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Etapa 4: Finalizacao</h2>
                    <p className="text-xs text-slate-500">Confira os dados e confirme o pedido.</p>
                  </div>

                  <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p><strong>Cliente:</strong> {orderResult?.customerName || form.name || '-'}</p>
                    <p><strong>Telefone:</strong> {orderResult?.customerPhone || form.phone || '-'}</p>
                    <p><strong>CPF:</strong> {orderResult?.customerDocument || form.document || '-'}</p>
                    <p><strong>E-mail:</strong> {orderResult?.customerEmail || form.email || '-'}</p>
                    <p>
                      <strong>Recebimento:</strong>{' '}
                      {(orderResult?.deliveryMethod || form.deliveryMethod) === 'entrega' ? 'Entrega' : 'Retirada'}
                    </p>
                    <p><strong>Pagamento:</strong> {orderResult ? paymentMethodLabels[orderResult.paymentMethod] : selectedPaymentLabel}</p>
                    {(orderResult?.orderNotes || form.orderNotes.trim()) && (
                      <p><strong>Observacoes:</strong> {orderResult?.orderNotes || form.orderNotes.trim()}</p>
                    )}
                    {reviewProductionTimeDays !== null && (
                      <p>
                        <strong>Tempo de producao:</strong> {reviewProductionTimeDays}{' '}
                        {reviewProductionTimeDays === 1 ? 'dia' : 'dias'}
                      </p>
                    )}
                    {reviewEstimatedDeliveryDate && (
                      <p>
                        <strong>Previsao de entrega:</strong> {formatDatePtBr(reviewEstimatedDeliveryDate)}
                      </p>
                    )}
                    <p><strong>Subtotal:</strong> {asCurrency(reviewTotal)}</p>
                    <p className="pt-1 text-sm"><strong>Total:</strong> {asCurrency(reviewTotal)}</p>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">Produtos</p>
                    <div className="space-y-2">
                      {reviewItems.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhum item no pedido.</p>
                      ) : (
                        reviewItems.map((item, index) => (
                          <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-2 text-xs">
                            <div>
                              <p className="font-medium text-slate-700">{item.name}</p>
                              <p className="text-slate-500">Qtd: {item.quantity}</p>
                              {item.notes && <p className="text-slate-500">Obs: {item.notes}</p>}
                            </div>
                            <p className="font-semibold text-slate-800">{asCurrency(item.total)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {!orderResult && personalizedItemsCount > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-semibold">
                        Itens personalizados: {personalizedItemsCount}
                      </p>
                      <p className="mt-1">
                        Arquivos anexados: {personalizedItemsWithReference}/{personalizedItemsCount}.
                        {personalizedItemsMissingReference > 0 ? ' Faltam anexos, mas isso e opcional.' : ' Todos os itens personalizados ja possuem anexo.'}
                      </p>
                      {personalizedItemsMissingReference > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 h-8 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                          onClick={() => goToStep(1)}
                        >
                          Voltar para anexar arquivo
                        </Button>
                      )}
                    </div>
                  )}

                  {!orderResult && (
                    <form onSubmit={handleSubmit}>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" onClick={() => goToStep(2)}>
                          Voltar
                        </Button>
                        <Button
                          type="submit"
                          className="bg-[#1a3a8f] hover:bg-[#16337e]"
                          disabled={submitting || cartItems.length === 0 || checkoutBlocked}
                        >
                          {submitting ? 'Enviando...' : 'Confirmar pedido'}
                        </Button>
                      </div>
                    </form>
                  )}

                  {orderResult && (
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 text-emerald-900">
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-semibold">
                            Pedido confirmado{orderResult.orderNumber ? ` #${orderResult.orderNumber}` : ''}
                          </p>
                          <p className="text-xs text-emerald-800">
                            Recebemos seu pedido e a loja pode continuar o atendimento.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                          <p className="text-emerald-700">Cliente</p>
                          <p className="font-semibold text-emerald-900">{orderResult.customerName}</p>
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                          <p className="text-emerald-700">Total</p>
                          <p className="font-semibold text-emerald-900">{asCurrency(orderResult.total)}</p>
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                          <p className="text-emerald-700">Pagamento</p>
                          <p className="font-semibold text-emerald-900">{paymentMethodLabels[orderResult.paymentMethod]}</p>
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                          <p className="text-emerald-700">Recebimento</p>
                          <p className="font-semibold text-emerald-900">
                            {orderResult.deliveryMethod === 'entrega' ? 'Entrega' : 'Retirada'}
                          </p>
                        </div>
                        {orderResult.productionTimeDaysUsed !== null && (
                          <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                            <p className="text-emerald-700">Tempo de producao</p>
                            <p className="font-semibold text-emerald-900">
                              {orderResult.productionTimeDaysUsed}{' '}
                              {orderResult.productionTimeDaysUsed === 1 ? 'dia' : 'dias'}
                            </p>
                          </div>
                        )}
                        {orderResult.estimatedDeliveryDate && (
                          <div className="rounded-md border border-emerald-200 bg-white p-2 text-xs">
                            <p className="text-emerald-700">Previsao de entrega</p>
                            <p className="font-semibold text-emerald-900">
                              {formatDatePtBr(orderResult.estimatedDeliveryDate)}
                            </p>
                          </div>
                        )}
                      </div>

                      {orderResult.orderNotes && (
                        <p className="mt-3 rounded-md border border-emerald-200 bg-white p-2 text-xs text-emerald-900">
                          <strong>Observacoes:</strong> {orderResult.orderNotes}
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {orderResult.publicToken && (
                          <Button
                            type="button"
                            className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"
                            onClick={() => navigate(`/pedido/${orderResult.publicToken}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Acompanhar pedido
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
                          onClick={() => navigate(catalogHref)}
                        >
                          Continuar comprando
                        </Button>
                      </div>

                      {(company.catalog_contact_url || company.whatsapp) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 w-full gap-2 border-emerald-400 bg-white text-emerald-800 hover:bg-emerald-100"
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
                        {pixGenerating ? 'Gerando QR Code PIX...' : pixErrorMessage || 'Gerando cobranca PIX para este pedido.'}
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
                        <Label className="text-xs">Codigo copia e cola</Label>
                        <Input value={pixResult.payment_copy_paste} readOnly />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2 border-sky-300 text-sky-800"
                          onClick={handleCopyPixCode}
                        >
                          <Copy className="h-4 w-4" />
                          {copiedPixCode ? 'Codigo copiado' : 'Copiar codigo PIX'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <CatalogFooter company={company} showAccount accountHref={customerOrdersPath} />
    </div>
  );
}
