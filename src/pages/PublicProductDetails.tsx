import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Phone, Mail, MapPin, MessageCircle, Package, Building2, ArrowLeft, Share2, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Company, PaymentMethod, Product } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveSuggestedPrice } from '@/lib/pricing';
import { CpfCnpjInput, PhoneInput, validateCpf } from '@/components/ui/masked-input';
import { useToast } from '@/hooks/use-toast';

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
}

interface ProductWithCategory extends Omit<Product, 'category'> {
  category?: { name: string } | null;
}

export default function PublicProductDetails() {
  const { slug, productId } = useParams<{ slug: string; productId: string }>();
  const [company, setCompany] = useState<CompanyWithColors | null>(null);
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const orderFormRef = useRef<HTMLDivElement>(null);
  const [orderForm, setOrderForm] = useState({
    name: '',
    phone: '',
    document: '',
    paymentMethod: '' as PaymentMethod | '',
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
      if (!slug || !productId) return;

      // Load company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (companyError || !companyData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const normalizedCompany = {
        ...(companyData as CompanyWithColors),
        logo_url: ensurePublicStorageUrl('product-images', companyData.logo_url),
      };
      setCompany(normalizedCompany);

      // Load product
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('id', productId)
        .eq('company_id', companyData.id)
        .eq('show_in_catalog', true)
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

      // Load related products (same category)
      if (productData.category_id) {
        const { data: relatedData } = await supabase
          .from('products')
          .select('*')
          .eq('company_id', companyData.id)
          .eq('category_id', productData.category_id)
          .eq('show_in_catalog', true)
          .eq('is_active', true)
          .neq('id', productId)
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
  }, [slug, productId]);

  useEffect(() => {
    if (!product) return;
    const minimumQuantity = Math.max(1, Number(product.min_order_quantity ?? 1));
    setOrderForm((prev) =>
      prev.quantity < minimumQuantity ? { ...prev, quantity: minimumQuantity } : prev
    );
  }, [product]);

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

  const openWhatsApp = () => {
    if (!company?.whatsapp || !product) return;
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
      } catch (err) {
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
    field: 'name' | 'phone' | 'document' | 'paymentMethod' | 'quantity',
    value: string | number
  ) => {
    setOrderForm((prev) => ({ ...prev, [field]: value }));
    clearOrderError(field);
    if (orderResult) setOrderResult(null);
  };

  const handleDocumentChange = (value: string) => {
    handleOrderFieldChange('document', value);
    const digits = value.replace(/\D/g, '');
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

    const phoneDigits = orderForm.phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      nextErrors.phone = 'Telefone invalido.';
    }

    const docDigits = orderForm.document.replace(/\D/g, '');
    if (docDigits.length !== 11 || !validateCpf(orderForm.document)) {
      nextErrors.document = 'CPF invalido.';
    }

    if (!orderForm.paymentMethod) {
      nextErrors.paymentMethod = 'Selecione a forma de pagamento.';
    }

    if (orderForm.quantity < 1) {
      nextErrors.quantity = 'Quantidade invalida.';
    } else if (product) {
      const minimumQuantity = Math.max(1, Number(product.min_order_quantity ?? 1));
      if (orderForm.quantity < minimumQuantity) {
        nextErrors.quantity = `A quantidade minima para este produto e ${minimumQuantity} unidade(s).`;
      }
    }

    const orderTotal = productPrice * orderForm.quantity;
    const minimumOrderValue = Number(company?.minimum_order_value || 0);
    if (minimumOrderValue > 0 && orderTotal < minimumOrderValue) {
      nextErrors.minimum = `O valor mínimo para pedidos é ${formatCurrency(minimumOrderValue)}.`;
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

    const { data, error } = await supabase.rpc('create_public_order', {
      p_company_id: company.id,
      p_customer_name: orderForm.name.trim(),
      p_customer_phone: orderForm.phone.trim(),
      p_customer_document: orderForm.document.trim(),
      p_payment_method: orderForm.paymentMethod as PaymentMethod,
      p_items: [
        {
          product_id: product.id,
          quantity: orderForm.quantity,
        },
      ],
    });

    if (error) {
      const isMinOrderError = error.message.includes('Minimum order value');
      const isMinQuantityError = error.message.includes('Minimum quantity not reached');
      const minimumQuantity = Math.max(1, Number(product?.min_order_quantity ?? 1));

      if (isMinOrderError) {
        const minimumOrderValue = Number(company?.minimum_order_value || 0);
        setOrderErrors((prev) => ({
          ...prev,
          minimum: `O valor mínimo para pedidos é ${formatCurrency(minimumOrderValue)}.`,
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
        ? `O valor mínimo para pedidos é ${formatCurrency(Number(company?.minimum_order_value || 0))}.`
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
      description: resolvedOrderNumber
        ? `Pedido #${resolvedOrderNumber} registrado.`
        : 'Pedido registrado.',
    });
    setOrderSubmitting(false);
  };

  // Custom colors
  const baseButtonColor = company?.catalog_primary_color || '#3b82f6';
  const baseSurfaceColor = company?.catalog_secondary_color || '#1e40af';
  const baseHighlightColor = company?.catalog_accent_color || '#f59e0b';
  const textColor = company?.catalog_text_color || '#111827';
  const headerBgColor = company?.catalog_header_bg_color || baseSurfaceColor;
  const headerTextColor = company?.catalog_header_text_color || textColor;
  const footerBgColor = company?.catalog_footer_bg_color || headerBgColor;
  const footerTextColor = company?.catalog_footer_text_color || headerTextColor;
  const priceColor = company?.catalog_price_color || baseHighlightColor;
  const badgeBgColor = company?.catalog_badge_bg_color || baseHighlightColor;
  const badgeTextColor = company?.catalog_badge_text_color || textColor;
  const buttonBgColor = company?.catalog_button_bg_color || baseButtonColor;
  const buttonTextColor = company?.catalog_button_text_color || '#ffffff';
  const buttonOutlineColor = company?.catalog_button_outline_color || baseButtonColor;
  const cardBgColor = company?.catalog_card_bg_color || '#ffffff';
  const cardBorderColor = company?.catalog_card_border_color || '#e5e7eb';

  const getProductPrice = (item: Product) => resolveSuggestedPrice(item, 1, [], 0);
  const productPrice = product ? getProductPrice(product) : 0;
  const orderTotal = productPrice * orderForm.quantity;
  const minimumOrderValue = Number(company?.minimum_order_value || 0);
  const minimumOrderQuantity = Math.max(1, Number(product?.min_order_quantity ?? 1));

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando produto...</div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Produto não encontrado</h1>
          <p className="text-muted-foreground mb-4">Este produto não existe ou não está disponível.</p>
          <Link to={`/catalogo/${slug}`}>
            <Button>Voltar ao catálogo</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background catalog-text">
      {/* Custom CSS Variables */}
      <style>{`
        .catalog-primary { color: ${buttonBgColor}; }
        .catalog-primary-bg { background-color: ${buttonBgColor}; }
        .catalog-secondary { color: ${headerBgColor}; }
        .catalog-secondary-bg { background-color: ${headerBgColor}; }
        .catalog-accent { color: ${priceColor}; }
        .catalog-accent-bg { background-color: ${priceColor}; }
        .catalog-btn {
          background-color: ${buttonBgColor};
          color: ${buttonTextColor};
        }
        .catalog-btn:hover {
          filter: brightness(0.92);
        }
        .catalog-btn-outline {
          border-color: ${buttonOutlineColor};
          color: ${buttonOutlineColor};
        }
        .catalog-btn-outline:hover {
          background-color: ${buttonOutlineColor};
          color: ${buttonTextColor};
        }
        .catalog-card {
          background-color: ${cardBgColor};
          border-color: ${cardBorderColor};
        }
        .catalog-badge {
          background-color: ${badgeBgColor};
          color: ${badgeTextColor};
        }
        .catalog-text { color: ${textColor}; }
        .catalog-text .text-foreground,
        .catalog-text .text-muted-foreground { color: ${textColor}; }
      `}</style>

      {/* Header */}
      <header className="border-b sticky top-0 z-10" style={{ backgroundColor: headerBgColor, color: headerTextColor }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/catalogo/${slug}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-white/20"
                  style={{ color: headerTextColor }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <div className="hidden sm:flex items-center gap-3">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="w-8 h-8 object-cover rounded bg-white/10" />
                ) : (
                  <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">
                    <Building2 className="h-4 w-4" />
                  </div>
                )}
                <span className="font-medium">{company?.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={shareProduct}
                className="hover:bg-white/20"
                style={{ color: headerTextColor }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </Button>
              {company?.whatsapp && (
                <Button
                  onClick={openWhatsApp}
                  className="gap-2 bg-white/20 hover:bg-white/30 border-0"
                  style={{ color: headerTextColor }}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="relative">
            <div className="aspect-square bg-muted rounded-lg overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-24 w-24 text-muted-foreground/30" />
                </div>
              )}
            </div>
            {product.category?.name && (
              <Badge
                className="absolute top-4 left-4 border-0 catalog-badge"
              >
                {product.category.name}
              </Badge>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-foreground mb-4">{product.name}</h1>

            <div className="text-4xl font-bold mb-6" style={{ color: priceColor }}>
              {formatCurrency(productPrice)}
            </div>

            {product.description && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Descrição</h2>
                <p className="text-foreground leading-relaxed">{product.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              {product.unit && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-1">Unidade</h3>
                  <p className="text-foreground">{product.unit}</p>
                </div>
              )}
              {product.sku && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-1">Código</h3>
                  <p className="text-foreground font-mono text-sm">{product.sku}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full gap-2 catalog-btn"
                onClick={handleStartOrder}
              >
                <Package className="h-5 w-5" />
                Fazer Pedido
              </Button>
              {company?.whatsapp && (
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2 catalog-btn-outline"
                  onClick={openWhatsApp}
                >
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2 catalog-btn-outline"
                onClick={shareProduct}
              >
                {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
                {copied ? 'Link Copiado!' : 'Compartilhar Produto'}
              </Button>
            </div>

            <div ref={orderFormRef} className="mt-6">
              <Card className="catalog-card">
                <CardContent className="p-4 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Pedido</h2>
                    <p className="text-sm text-muted-foreground">
                      Preencha os dados para enviar o pedido.
                    </p>
                  </div>

                  {orderResult && (
                    <div className="rounded-md border bg-muted/20 p-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Comprovante do Pedido</span>
                        <Badge variant="secondary">Pendente</Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Pedido</span>
                          <span className="font-medium">
                            {orderResult.orderNumber ? `#${orderResult.orderNumber}` : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Cliente</span>
                          <span className="font-medium">{orderResult.customerName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">CPF</span>
                          <span className="font-medium">{orderResult.document}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Telefone</span>
                          <span className="font-medium">{orderResult.phone}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Produto</span>
                          <span className="font-medium">
                            {orderResult.productName} x{orderResult.quantity}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Forma de pagamento</span>
                          <span className="font-medium">{formatPaymentMethod(orderResult.paymentMethod)}</span>
                        </div>
                        <div className="flex items-center justify-between text-base">
                          <span className="font-semibold">Total</span>
                          <span className="font-semibold">{formatCurrency(orderResult.total)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Status inicial</span>
                          <span>Pendente</span>
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
                          <p className="mt-1 text-xs text-muted-foreground">
                            Quantidade minima: {minimumOrderQuantity} unidade(s).
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total estimado</span>
                      <span className="font-semibold">{formatCurrency(orderTotal)}</span>
                    </div>

                    {minimumOrderValue > 0 && (
                      <p
                        className={`text-xs ${
                          orderTotal < minimumOrderValue ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        O valor mínimo para pedidos é {formatCurrency(minimumOrderValue)}.
                      </p>
                    )}

                    <Button type="submit" className="w-full catalog-btn" disabled={orderSubmitting}>
                      {orderSubmitting ? 'Enviando...' : 'Enviar Pedido'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      O pagamento sera confirmado somente no PDV ou no painel administrativo.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <>
            <Separator className="my-12" />
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-6">Produtos Relacionados</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {relatedProducts.map(related => (
                  <Link key={related.id} to={`/catalogo/${slug}/produto/${related.id}`}>
                    <Card className="overflow-hidden group hover:shadow-lg transition-shadow cursor-pointer catalog-card">
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        {related.image_url ? (
                          <img
                            src={related.image_url}
                            alt={related.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-12 w-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-foreground mb-1 line-clamp-2">{related.name}</h3>
                        <span className="text-lg font-bold" style={{ color: priceColor }}>
                          {formatCurrency(getProductPrice(related))}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Company Contact */}
        <Separator className="my-12" />
        <Card className="catalog-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-4 flex-1">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="w-16 h-16 object-cover rounded-lg" />
                ) : (
                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg text-foreground">{company?.name}</h3>
                  {company?.city && company?.state && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
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
                      Email
                    </a>
                  </Button>
                )}
                <Link to={`/catalogo/${slug}`}>
                  <Button variant="default" size="sm" className="w-full sm:w-auto catalog-btn">
                    Ver Catálogo Completo
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12" style={{ backgroundColor: footerBgColor, color: footerTextColor }}>
        <div className="container mx-auto px-4 py-6 text-center text-sm opacity-80">
          <p>© {new Date().getFullYear()} {company?.name}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
