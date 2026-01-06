import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Heart,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  Share2,
  ShoppingCart,
  Star,
  Tag,
  User
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { getBasePrice, isPromotionActive, resolveSuggestedPrice } from '@/lib/pricing';
import { CpfCnpjInput, PhoneInput, normalizeDigits, validateCpf, validatePhone } from '@/components/ui/masked-input';
import { useToast } from '@/hooks/use-toast';
import { Company, PaymentMethod, Product } from '@/types/database';

interface CompanyWithColors extends Company {
  catalog_primary_color?: string;
  catalog_secondary_color?: string;
  catalog_accent_color?: string;
  catalog_text_color?: string;
  catalog_header_bg_color?: string;
  catalog_header_text_color?: string;
  catalog_footer_bg_color?: string;
  catalog_footer_text_color?: string;
  catalog_price_color?: string;
  catalog_badge_bg_color?: string;
  catalog_badge_text_color?: string;
  catalog_button_bg_color?: string;
  catalog_button_text_color?: string;
  catalog_button_outline_color?: string;
  catalog_card_bg_color?: string;
  catalog_card_border_color?: string;
  catalog_filter_bg_color?: string;
  catalog_filter_text_color?: string;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_contact_url?: string | null;
}

interface ProductWithCategory extends Omit<Product, 'category'> {
  category?: { name: string } | null;
}

const colorSwatches = ['#1e293b', '#0ea5e9', '#be185d', '#eab308'];

export default function PublicProductDetails() {
  const { slug, productSlug } = useParams<{ slug?: string; productSlug?: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyWithColors | null>(null);
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'descricao' | 'especificacoes' | 'envio' | 'avaliacoes'>('descricao');
  const { toast } = useToast();
  const orderFormRef = useRef<HTMLDivElement>(null);
  const [orderForm, setOrderForm] = useState({
    name: '',
    phone: '',
    document: '',
    paymentMethod: '' as PaymentMethod | '',
    customization: '',
    quantity: 1,
  });
  const [orderErrors, setOrderErrors] = useState<{
    name?: string;
    phone?: string;
    document?: string;
    paymentMethod?: string;
    quantity?: string;
    minimum?: string;
  }>({});
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    orderNumber: number | null;
    customerName: string;
    document: string;
    phone: string;
    paymentMethod: PaymentMethod;
    quantity: number;
    total: number;
    productName: string;
  } | null>(null);
  const [cpfStatus, setCpfStatus] = useState<'valid' | 'invalid' | null>(null);

  useEffect(() => {
    const loadProduct = async () => {
      if (!productSlug) return;

      let companyData: Company | null = null;
      if (slug) {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();
        if (!error) companyData = data as Company;
      }

      if (!companyData && !slug) {
        const { data: productLookup } = await supabase
          .from('products')
          .select('company_id')
          .eq('slug', productSlug)
          .maybeSingle();
        if (productLookup?.company_id) {
          const companyResult = await supabase
            .from('companies')
            .select('*')
            .eq('id', productLookup.company_id)
            .eq('is_active', true)
            .maybeSingle();
          companyData = companyResult.data as Company | null;
        }
      }

      if (!companyData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const normalizedCompany = {
        ...(companyData as CompanyWithColors),
        logo_url: ensurePublicStorageUrl('product-images', companyData.logo_url),
      };
      setCompany(normalizedCompany);

      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('company_id', companyData.id)
        .or(`id.eq.${productSlug},slug.eq.${productSlug}`)
        .or('catalog_enabled.is.true,show_in_catalog.is.true')
        .eq('is_active', true)
        .single();

      if (productError || !productData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProduct({
        ...(productData as ProductWithCategory),
        image_url: ensurePublicStorageUrl('product-images', productData.image_url),
      });

      if (productData.category_id) {
        const { data: relatedData } = await supabase
          .from('products')
          .select('*')
          .eq('company_id', companyData.id)
          .eq('category_id', productData.category_id)
          .or('catalog_enabled.is.true,show_in_catalog.is.true')
          .eq('is_active', true)
          .neq('id', productData.id)
          .limit(4);

        const mappedRelated = (relatedData as Product[] || []).map((related) => ({
          ...related,
          image_url: ensurePublicStorageUrl('product-images', related.image_url),
        }));
        setRelatedProducts(mappedRelated);
      }

      setLoading(false);
    };

    loadProduct();
  }, [slug, productSlug]);

  useEffect(() => {
    if (!product) return;
    const minimumQuantity = Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1));
    setOrderForm((prev) =>
      prev.quantity < minimumQuantity ? { ...prev, quantity: minimumQuantity } : prev
    );
  }, [product]);

  useEffect(() => {
    if (!product || !company) return;
    const title = `${product.name} | ${company.catalog_title || company.name}`;
    const description = product.catalog_short_description || product.description || `Produto ${product.name}`;
    document.title = title;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
  }, [product, company]);

  const basePrice = product?.catalog_price ?? null;
  const productPrice = product
    ? (basePrice ?? resolveSuggestedPrice(product as Product, orderForm.quantity, [], 0))
    : 0;
  const unitPrice = product
    ? (basePrice ?? resolveSuggestedPrice(product as Product, 1, [], 0))
    : 0;
  const orderTotal = productPrice * orderForm.quantity;
  const minimumOrderValue = Number(company?.minimum_order_value || 0);
  const minimumOrderQuantity = Math.max(1, Number(product?.catalog_min_order ?? product?.min_order_quantity ?? 1));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatPaymentMethod = (value: PaymentMethod) => {
    const labels: Record<PaymentMethod, string> = {
      dinheiro: 'Dinheiro',
      cartao: 'Cartao',
      pix: 'Pix',
      boleto: 'Boleto',
      outro: 'Outro',
    };
    return labels[value] || value;
  };

  const openContact = () => {
    if (!product) return;
    if (company?.catalog_contact_url) {
      const link = company.catalog_contact_url.replace('{produto}', product.name);
      window.open(link, '_blank');
      return;
    }
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    const message = `Olá! Gostaria de saber mais sobre o produto: ${product.name}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const shareProduct = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: product?.name,
          text: `Confira este produto: ${product?.name}`,
          url,
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartOrder = () => {
    orderFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const clearOrderError = (field: keyof typeof orderErrors) => {
    setOrderErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleOrderFieldChange = (
    field: 'name' | 'phone' | 'document' | 'paymentMethod' | 'customization' | 'quantity',
    value: string | number
  ) => {
    setOrderForm((prev) => ({ ...prev, [field]: value }));
    clearOrderError(field);
    if (orderResult) setOrderResult(null);
  };

  const handleDocumentChange = (value: string) => {
    handleOrderFieldChange('document', value);
    const digits = normalizeDigits(value);
    if (!digits) {
      setCpfStatus(null);
      clearOrderError('document');
      return;
    }
    if (digits.length < 11) {
      setCpfStatus(null);
      return;
    }
    const valid = validateCpf(value);
    setCpfStatus(valid ? 'valid' : 'invalid');
    setOrderErrors((prev) => {
      const next = { ...prev };
      if (valid) {
        delete next.document;
      } else {
        next.document = 'CPF invalido.';
      }
      return next;
    });
  };

  const validateOrderForm = () => {
    const nextErrors: {
      name?: string;
      phone?: string;
      document?: string;
      paymentMethod?: string;
      quantity?: string;
      minimum?: string;
    } = {};

    if (!orderForm.name.trim()) {
      nextErrors.name = 'Informe o nome completo.';
    }

    if (!validatePhone(orderForm.phone)) {
      nextErrors.phone = 'Telefone invalido.';
    }

    const docDigits = normalizeDigits(orderForm.document);
    if (docDigits.length !== 11 || !validateCpf(orderForm.document)) {
      nextErrors.document = 'CPF invalido.';
    }

    if (!orderForm.paymentMethod) {
      nextErrors.paymentMethod = 'Selecione a forma de pagamento.';
    }

    if (orderForm.quantity < 1) {
      nextErrors.quantity = 'Quantidade invalida.';
    } else if (product) {
      const minimumQuantity = Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1));
      if (orderForm.quantity < minimumQuantity) {
        nextErrors.quantity = `A quantidade minima para este produto e ${minimumQuantity} unidade(s).`;
      }
    }

    const minValue = Number(company?.minimum_order_value || 0);
    if (minValue > 0 && orderTotal < minValue) {
      nextErrors.minimum = `O valor minimo para pedidos e ${formatCurrency(minValue)}.`;
    }

    setOrderErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const handleOrderSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !product) return;

    if (!validateOrderForm()) return;

    setOrderSubmitting(true);
    setOrderResult(null);

    const phoneDigits = normalizeDigits(orderForm.phone);
    const documentDigits = normalizeDigits(orderForm.document);
    const { data, error } = await supabase.rpc('create_public_order', {
      p_company_id: company.id,
      p_customer_name: orderForm.name.trim(),
      p_customer_phone: phoneDigits,
      p_customer_document: documentDigits,
      p_payment_method: orderForm.paymentMethod as PaymentMethod,
      p_items: [
        {
          product_id: product.id,
          quantity: orderForm.quantity,
          notes: orderForm.customization.trim() ? orderForm.customization.trim() : null,
        },
      ],
    });

    if (error) {
      const isMinOrderError = error.message.includes('Minimum order value');
      const isMinQuantityError = error.message.includes('Minimum quantity not reached');
      const minimumQuantity = Math.max(1, Number(product?.catalog_min_order ?? product?.min_order_quantity ?? 1));

      if (isMinOrderError) {
        const minValue = Number(company?.minimum_order_value || 0);
        setOrderErrors((prev) => ({
          ...prev,
          minimum: `O valor minimo para pedidos e ${formatCurrency(minValue)}.`,
        }));
      }

      if (isMinQuantityError) {
        setOrderErrors((prev) => ({
          ...prev,
          quantity: `A quantidade minima para este produto e ${minimumQuantity} unidade(s).`,
        }));
      }

      const errorMessage = isMinQuantityError
        ? `A quantidade minima para este produto e ${minimumQuantity} unidade(s).`
        : isMinOrderError
          ? `O valor minimo para pedidos e ${formatCurrency(Number(company?.minimum_order_value || 0))}.`
          : error.message;

      toast({
        title: 'Erro ao enviar pedido',
        description: errorMessage,
        variant: 'destructive',
      });
      setOrderSubmitting(false);
      return;
    }

    const orderNumber = Number((data as { order_number?: number } | null)?.order_number ?? NaN);
    const resolvedOrderNumber = Number.isFinite(orderNumber) ? orderNumber : null;
    setOrderResult({
      orderNumber: resolvedOrderNumber,
      customerName: orderForm.name.trim(),
      document: orderForm.document.trim(),
      phone: orderForm.phone.trim(),
      paymentMethod: orderForm.paymentMethod as PaymentMethod,
      quantity: orderForm.quantity,
      total: productPrice * orderForm.quantity,
      productName: product.name,
    });
    toast({
      title: 'Pedido enviado com sucesso',
      description: resolvedOrderNumber ? `Pedido #${resolvedOrderNumber} registrado.` : 'Pedido registrado.',
    });
    setOrderSubmitting(false);
  };

  const baseButtonColor = company?.catalog_primary_color || '#2563eb';
  const textColor = company?.catalog_text_color || '#0f172a';
  const headerBgColor = company?.catalog_header_bg_color || '#f8fafc';
  const headerTextColor = company?.catalog_header_text_color || '#0f172a';
  const footerBgColor = company?.catalog_footer_bg_color || '#f8fafc';
  const footerTextColor = company?.catalog_footer_text_color || '#0f172a';
  const priceColor = company?.catalog_price_color || baseButtonColor;
  const showPrices = company?.catalog_show_prices ?? true;
  const showContact = company?.catalog_show_contact ?? true;
  const badgeBgColor = company?.catalog_badge_bg_color || baseButtonColor;
  const badgeTextColor = company?.catalog_badge_text_color || '#ffffff';
  const buttonBgColor = company?.catalog_button_bg_color || '#2563eb';
  const buttonTextColor = company?.catalog_button_text_color || '#ffffff';
  const buttonOutlineColor = company?.catalog_button_outline_color || '#2563eb';
  const cardBgColor = company?.catalog_card_bg_color || '#ffffff';
  const cardBorderColor = company?.catalog_card_border_color || '#e2e8f0';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Carregando produto...</div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Produto não encontrado</h1>
          <p className="text-slate-500 mb-4">Este produto não existe ou não está disponível.</p>
          <Link to={`/catalogo/${slug}`}>
            <Button>Voltar ao catalogo</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ color: textColor }}>
      <style>{`
        .catalog-primary { color: ${baseButtonColor}; }
        .catalog-btn { background-color: ${buttonBgColor}; color: ${buttonTextColor}; }
        .catalog-btn:hover { filter: brightness(0.92); }
        .catalog-btn-outline { border-color: ${buttonOutlineColor}; color: ${buttonOutlineColor}; }
        .catalog-btn-outline:hover { background-color: ${buttonOutlineColor}; color: ${buttonTextColor}; }
        .catalog-card { background-color: ${cardBgColor}; border-color: ${cardBorderColor}; }
        .catalog-badge { background-color: ${badgeBgColor}; color: ${badgeTextColor}; }
        .catalog-price { color: ${priceColor}; }
      `}</style>

      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: headerBgColor, color: headerTextColor }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/catalogo/${slug}`))}
              className="gap-2 text-xs text-slate-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-2">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company?.name || 'Logo'}
                  className="w-7 h-7 rounded bg-white/80 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center">
                  <Package className="h-4 w-4" />
                </div>
              )}
              <span className="text-sm font-semibold">{company?.name || 'IDEART'}</span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-xs text-slate-500">
              <Link to="/">Inicio</Link>
              <Link to={`/catalogo/${slug}`}>Catálogo</Link>
              <span>Servicos</span>
              <span>Contato</span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
              <Search className="h-4 w-4" />
              <input
                placeholder="Buscar produtos..."
                className="bg-transparent focus:outline-none"
              />
            </div>
            <button className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900">
              <ShoppingCart className="h-4 w-4 mx-auto" />
            </button>
            <button className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900">
              <User className="h-4 w-4 mx-auto" />
            </button>
            <button className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 md:hidden">
              <Menu className="h-4 w-4 mx-auto" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
          <Link to={`/catalogo/${slug}`} className="hover:text-slate-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <span>{product.category?.name || 'Catálogo'}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600 font-medium">{product.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl bg-slate-900">
              {isPromotionActive(product as Product) && (
                <Badge className="absolute top-4 left-4 catalog-badge">Novidade</Badge>
              )}
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="aspect-square flex items-center justify-center bg-slate-800">
                  <Package className="h-16 w-16 text-white/30" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`h-16 w-16 rounded-lg border ${index === 0 ? 'border-primary' : 'border-slate-200'} bg-white overflow-hidden`}
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt="thumb" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{product.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-1 text-yellow-500">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className={`h-4 w-4 ${index < 4 ? 'fill-yellow-400' : ''}`} />
                  ))}
                </div>
                <span>(128 avaliacoes)</span>
                <Badge variant="secondary">Em estoque</Badge>
              </div>
            </div>

            {showPrices ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold catalog-price">{formatCurrency(unitPrice)}</span>
                {isPromotionActive(product as Product) && (
                  <span className="text-sm text-slate-400 line-through">{formatCurrency(getBasePrice(product as Product))}</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Preco sob consulta</div>
            )}

            <p className="text-sm text-slate-600 leading-relaxed">
              {product.catalog_short_description || product.description || 'Descricao detalhada do produto.'}
            </p>

            <div className="border-t border-slate-200 pt-4 space-y-4">
              <div>
                <Label className="text-xs uppercase text-slate-500">Cor da Capa</Label>
                <div className="mt-2 flex gap-2">
                  {colorSwatches.map((color, index) => (
                    <button
                      key={color}
                      className={`h-8 w-8 rounded-full border-2 ${index === 0 ? 'border-primary' : 'border-transparent'} bg-white`}
                      style={{ backgroundColor: color }}
                      aria-label="Cor"
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <Label>Personalizacao (Nome na capa)</Label>
                  <span>Gratis</span>
                </div>
                <Input
                  placeholder="Ex: Ana Silva"
                  className="mt-2"
                  maxLength={20}
                  value={orderForm.customization}
                  onChange={(event) =>
                    handleOrderFieldChange('customization', event.target.value.slice(0, 20))
                  }
                />
                <p className="mt-1 text-xs text-slate-400">Máximo de 20 caracteres.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex items-center border border-slate-200 rounded-lg bg-white h-10 w-28">
                  <button
                    className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-700"
                    onClick={() => handleOrderFieldChange('quantity', Math.max(1, orderForm.quantity - 1))}
                    aria-label="Diminuir"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="flex-1 text-center text-sm font-medium">{orderForm.quantity}</span>
                  <button
                    className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-700"
                    onClick={() => handleOrderFieldChange('quantity', orderForm.quantity + 1)}
                    aria-label="Aumentar"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <Button className="flex-1 catalog-btn" onClick={handleStartOrder}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Adicionar ao Carrinho
                </Button>
                <button className="h-10 w-10 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500">
                  <Heart className="h-4 w-4 mx-auto" />
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Compra segura</span>
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Frete gratis acima de R$199</span>
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Garantia de qualidade</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
                  <Button variant="outline" className="catalog-btn-outline" onClick={openContact}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                )}
                <Button variant="outline" className="catalog-btn-outline" onClick={shareProduct}>
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                  {copied ? 'Link copiado' : 'Compartilhar'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap border-b border-slate-200 text-sm">
            {[
              { id: 'descricao', label: 'Descricao detalhada' },
              { id: 'especificacoes', label: 'Especificacoes tecnicas' },
              { id: 'envio', label: 'Envio e prazos' },
              { id: 'avaliacoes', label: 'Avaliacoes (128)' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`px-6 py-3 font-medium ${activeTab === tab.id ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-500'}`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'descricao' && (
              <div className="space-y-4 text-sm text-slate-600">
                <p>
                  {product.catalog_long_description || product.description || 'Descricao detalhada do produto para apresentar beneficios e diferenciais.'}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h4 className="font-semibold text-slate-800 mb-2">Sustentabilidade</h4>
                    <p className="text-xs text-slate-500">Papel de fontes responsaveis e materiais duraveis para uso diario.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h4 className="font-semibold text-slate-800 mb-2">Personalizacao</h4>
                    <p className="text-xs text-slate-500">Gravacao com qualidade premium para destacar sua marca.</p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'especificacoes' && (
              <div className="space-y-2 text-sm text-slate-600">
                <p><strong>SKU:</strong> {product.sku || 'Não informado'}</p>
                <p><strong>Unidade:</strong> {product.unit || 'Não informada'}</p>
                <p><strong>Quantidade minima:</strong> {minimumOrderQuantity}</p>
              </div>
            )}
            {activeTab === 'envio' && (
              <div className="text-sm text-slate-600">
                Consulte prazos e modalidades de entrega com a equipe. Pedidos acima de R$199 possuem frete gratis.
              </div>
            )}
            {activeTab === 'avaliacoes' && (
              <div className="text-sm text-slate-600">Avaliacoes em breve.</div>
            )}
          </div>
        </div>

        <div ref={orderFormRef} className="mt-12">
          <Card className="catalog-card border">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Finalizar pedido</h2>
                  <p className="text-sm text-slate-500">Preencha os dados para enviar o pedido.</p>
                </div>
                {orderResult && <Badge variant="secondary">Pendente</Badge>}
              </div>

              {orderResult && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Comprovante do pedido</span>
                    <span className="text-slate-500">#{orderResult.orderNumber || '-'}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Cliente</span>
                      <span className="font-medium">{orderResult.customerName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">CPF</span>
                      <span className="font-medium">{orderResult.document}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Telefone</span>
                      <span className="font-medium">{orderResult.phone}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Forma de pagamento</span>
                      <span className="font-medium">{formatPaymentMethod(orderResult.paymentMethod)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Total</span>
                      <span className="font-semibold">{formatCurrency(orderResult.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleOrderSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="order-name">Nome completo *</Label>
                    <Input
                      id="order-name"
                      value={orderForm.name}
                      onChange={(event) => handleOrderFieldChange('name', event.target.value)}
                      placeholder="Nome e sobrenome"
                    />
                    {orderErrors.name && (
                      <p className="mt-1 text-xs text-destructive">{orderErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="order-phone">Telefone (WhatsApp) *</Label>
                    <PhoneInput
                      id="order-phone"
                      value={orderForm.phone}
                      onChange={(value) => handleOrderFieldChange('phone', value)}
                      className={orderErrors.phone ? 'border-destructive' : ''}
                    />
                    {orderErrors.phone && (
                      <p className="mt-1 text-xs text-destructive">{orderErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="order-document">CPF *</Label>
                    <CpfCnpjInput
                      id="order-document"
                      value={orderForm.document}
                      onChange={(value) => handleDocumentChange(value)}
                      className={
                        cpfStatus === 'valid'
                          ? 'border-emerald-500 focus-visible:ring-emerald-500'
                          : cpfStatus === 'invalid' || orderErrors.document
                            ? 'border-destructive focus-visible:ring-destructive'
                            : ''
                      }
                    />
                    {orderErrors.document && (
                      <p className="mt-1 text-xs text-destructive">{orderErrors.document}</p>
                    )}
                    {!orderErrors.document && cpfStatus === 'valid' && (
                      <p className="mt-1 text-xs text-emerald-600">CPF valido.</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="order-payment">Forma de pagamento *</Label>
                    <Select
                      value={orderForm.paymentMethod}
                      onValueChange={(value) =>
                        handleOrderFieldChange('paymentMethod', value as PaymentMethod)
                      }
                    >
                      <SelectTrigger
                        id="order-payment"
                        className={orderErrors.paymentMethod ? 'border-destructive' : ''}
                      >
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
                    {orderErrors.paymentMethod && (
                      <p className="mt-1 text-xs text-destructive">{orderErrors.paymentMethod}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="order-quantity">Quantidade *</Label>
                    <Input
                      id="order-quantity"
                      type="number"
                      min="1"
                      value={orderForm.quantity}
                      onChange={(event) =>
                        handleOrderFieldChange(
                          'quantity',
                          Math.max(1, Number(event.target.value) || 1)
                        )
                      }
                    />
                    {orderErrors.quantity && (
                      <p className="mt-1 text-xs text-destructive">{orderErrors.quantity}</p>
                    )}
                    {!orderErrors.quantity && minimumOrderQuantity > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Quantidade minima: {minimumOrderQuantity} unidade(s).
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total estimado</span>
                  <span className="font-semibold">{formatCurrency(orderTotal)}</span>
                </div>

                {minimumOrderValue > 0 && (
                  <p className={`text-xs ${orderTotal < minimumOrderValue ? 'text-destructive' : 'text-slate-500'}`}>
                    O valor minimo para pedidos e {formatCurrency(minimumOrderValue)}.
                  </p>
                )}

                <Button type="submit" className="w-full catalog-btn" disabled={orderSubmitting}>
                  {orderSubmitting ? 'Enviando...' : 'Enviar pedido'}
                </Button>
                <p className="text-xs text-slate-400">
                  O pagamento será confirmado somente no PDV ou no painel administrativo.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
        {relatedProducts.length > 0 && (
          <>
            <Separator className="my-12" />
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Compre junto</h2>
                <Link to={`/catalogo/${slug}`} className="text-xs text-primary">Ver catalogo completo</Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {relatedProducts.map((related) => (
                  <Link
                    key={related.id}
                    to={`/catalogo/${slug}/produto/${related.slug?.trim() ? related.slug : related.id}`}
                  >
                    <Card className="overflow-hidden border border-slate-200 bg-white hover:shadow-md transition-shadow">
                      <div className="aspect-square bg-slate-100 relative overflow-hidden">
                        {isPromotionActive(related) && (
                          <div className="absolute top-2 left-2 z-10">
                            <Badge className="bg-amber-500 text-white border-none gap-1 py-1 px-2 font-bold shadow-sm">
                              <Tag className="h-3 w-3" />
                              OFERTA
                            </Badge>
                          </div>
                        )}
                        {related.image_url ? (
                          <img
                            src={related.image_url}
                            alt={related.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-12 w-12 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-sm mb-1 truncate">{related.name}</h3>
                        {showPrices ? (
                          <span className="text-sm font-bold catalog-price">
                            {formatCurrency(resolveSuggestedPrice(related, 1, [], 0))}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Preco sob consulta</span>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator className="my-12" />
        <Card className="catalog-card border">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-4 flex-1">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="w-12 h-12 object-cover rounded-lg" />
                ) : (
                  <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold">{company?.name}</h3>
                  {company?.city && company?.state && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {company.city}, {company.state}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {company?.phone && (
                  <Button variant="outline" size="sm" className="catalog-btn-outline" asChild>
                    <a href={`tel:${company.phone}`}>
                      <Phone className="h-4 w-4 mr-2" />
                      Ligar
                    </a>
                  </Button>
                )}
                {company?.email && (
                  <Button variant="outline" size="sm" className="catalog-btn-outline" asChild>
                    <a href={`mailto:${company.email}`}>
                      <Mail className="h-4 w-4 mr-2" />
                      E-mail
                    </a>
                  </Button>
                )}
                <Link to={`/catalogo/${slug}`}>
                  <Button size="sm" className="catalog-btn w-full sm:w-auto">
                    Ver catalogo completo
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t mt-12" style={{ backgroundColor: footerBgColor, color: footerTextColor }}>
        <div className="mx-auto max-w-6xl px-4 py-8 grid gap-6 sm:grid-cols-2 md:grid-cols-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-semibold">{company?.name}</h4>
            <p className="text-xs text-slate-500">Transformando ideias em arte impressa.</p>
          </div>
          <div className="space-y-2 text-xs text-slate-500">
            <p>Empresa</p>
            <p>Sobre nos</p>
            <p>Blog</p>
          </div>
          <div className="space-y-2 text-xs text-slate-500">
            <p>Ajuda</p>
            <p>Termos de uso</p>
            <p>Politica de privacidade</p>
          </div>
          <div className="space-y-2 text-xs text-slate-500">
            <p>Newsletter</p>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-slate-200 px-2 py-1" placeholder="Seu e-mail" />
              <Button size="sm" className="catalog-btn">Enviar</Button>
            </div>
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-400">
            (c) {new Date().getFullYear()} {company?.name}. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
