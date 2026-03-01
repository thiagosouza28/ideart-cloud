import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle as Whatsapp,
  Minus,
  Package,
  Phone,
  Plus,
  Share2,
  ShoppingCart,
  Star,
  Tag
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { publicSupabase } from '@/integrations/supabase/public-client';
import {
  PUBLIC_CART_UPDATED_EVENT,
  getPublicCartItemsCount,
  upsertPublicCartItem,
} from '@/lib/public-cart';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { isPromotionActive, resolveProductBasePrice, resolveProductPrice } from '@/lib/pricing';
import { useToast } from '@/hooks/use-toast';
import { Company, Product, ProductColor, ProductReview } from '@/types/database';

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

const normalizeProductColors = (value: unknown): ProductColor[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const hex = typeof record.hex === 'string' ? record.hex.trim() : '';
      const active = typeof record.active === 'boolean' ? record.active : true;
      if (!name || !hex) return null;
      return { name, hex, active };
    })
    .filter((color): color is ProductColor => !!color);
};

const normalizeProductImages = (value: unknown, fallback?: string | null): string[] => {
  const rawList = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
  const normalized = rawList
    .map((url) => ensurePublicStorageUrl('product-images', url) || url)
    .filter((url): url is string => Boolean(url));
  const withFallback = fallback ? [fallback, ...normalized] : normalized;
  const unique = withFallback.filter((url, index, self) => self.indexOf(url) === index);
  return unique.slice(0, 5);
};

const initials = (value?: string | null) => {
  const safe = (value || 'Catalogo').trim();
  if (!safe) return 'C';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function PublicProductDetails() {
  const { slug, productSlug } = useParams<{ slug?: string; productSlug?: string }>();
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const [company, setCompany] = useState<CompanyWithColors | null>(null);
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'descricao' | 'especificacoes' | 'envio' | 'avaliacoes'>('descricao');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { toast } = useToast();
  const [cartItemsCount, setCartItemsCount] = useState(0);
  const [orderForm, setOrderForm] = useState({
    customization: '',
    quantity: 1,
  });
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [selectedReviewImage, setSelectedReviewImage] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({
    name: '',
    phone: '',
    rating: 0,
    comment: '',
  });
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState<string[]>([]);
  const reviewImagePreviewsRef = useRef<string[]>([]);
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  useEffect(() => {
    const loadProduct = async () => {
      const resolvedProductSlug = productSlug?.trim();
      if (!resolvedProductSlug) return;

      let companyData: Company | null = null;
      if (slug) {
        const { data, error } = await publicSupabase
          .from('companies')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();
        if (!error) companyData = data as Company;
      }

      if (!companyData && !slug) {
        let productLookupQuery = publicSupabase.from('products').select('company_id');
        if (isUuid(resolvedProductSlug)) {
          productLookupQuery = productLookupQuery.or(
            `id.eq.${resolvedProductSlug},slug.eq.${resolvedProductSlug}`
          );
        } else {
          productLookupQuery = productLookupQuery.eq('slug', resolvedProductSlug);
        }
        const { data: productLookup } = await productLookupQuery.maybeSingle();
        if (productLookup?.company_id) {
          const companyResult = await publicSupabase
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

      let productQuery = publicSupabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('company_id', companyData.id)
        .or('catalog_enabled.is.true,show_in_catalog.is.true')
        .eq('is_active', true);

      if (isUuid(resolvedProductSlug)) {
        productQuery = productQuery.or(
          `id.eq.${resolvedProductSlug},slug.eq.${resolvedProductSlug}`
        );
      } else {
        productQuery = productQuery.eq('slug', resolvedProductSlug);
      }

      const { data: productData, error: productError } = await productQuery.single();

      if (productError || !productData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const normalizedPrimaryImage = ensurePublicStorageUrl('product-images', productData.image_url);
      const normalizedImages = normalizeProductImages(productData.image_urls, normalizedPrimaryImage);
      setProduct({
        ...(productData as ProductWithCategory),
        image_url: normalizedImages[0] ?? normalizedPrimaryImage,
        image_urls: normalizedImages,
      });

      if (productData.category_id) {
        const { data: relatedData } = await publicSupabase
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

  useEffect(() => {
    if (!company?.id) {
      setCartItemsCount(0);
      return;
    }

    const refreshCartCount = () => {
      setCartItemsCount(getPublicCartItemsCount(company.id));
    };

    const handleStorage = () => {
      refreshCartCount();
    };

    const handleCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ companyId?: string }>).detail;
      if (!detail?.companyId || detail.companyId === company.id) {
        refreshCartCount();
      }
    };

    refreshCartCount();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(PUBLIC_CART_UPDATED_EVENT, handleCartUpdated as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PUBLIC_CART_UPDATED_EVENT, handleCartUpdated as EventListener);
    };
  }, [company?.id]);

  const availableColors = useMemo(
    () => normalizeProductColors(product?.product_colors).filter((color) => color.active),
    [product?.product_colors]
  );
  const productImages = useMemo(
    () => normalizeProductImages(product?.image_urls, product?.image_url),
    [product?.image_urls, product?.image_url]
  );

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [product?.id, productImages.length]);

  useEffect(() => {
    if (availableColors.length > 0) {
      setSelectedColorIndex(0);
    }
  }, [product?.id, availableColors.length]);

  useEffect(() => {
    const loadReviews = async () => {
      if (!product?.id) {
        setReviews([]);
        setReviewsLoading(false);
        return;
      }

      setReviewsLoading(true);
      const { data, error } = await publicSupabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) {
        setReviews([]);
      } else {
        setReviews((data || []) as ProductReview[]);
      }
      setReviewsLoading(false);
    };

    void loadReviews();
  }, [product?.id]);

  useEffect(() => {
    reviewImagePreviewsRef.current = reviewImagePreviews;
  }, [reviewImagePreviews]);

  useEffect(() => {
    return () => {
      reviewImagePreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!selectedReviewImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedReviewImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReviewImage]);

  const unitPrice = product ? resolveProductPrice(product as Product, 1, [], 0) : 0;
  const minimumOrderQuantity = Math.max(1, Number(product?.catalog_min_order ?? product?.min_order_quantity ?? 1));
  const promoBasePrice = product && isPromotionActive(product as Product)
    ? resolveProductBasePrice(product as Product, 1, [], 0)
    : null;
  const activeImage = productImages[selectedImageIndex] ?? product?.image_url ?? null;
  const thumbnailImages: Array<string | null> = productImages.length > 0
    ? productImages
    : Array.from({ length: 4 }, () => null);
  const isPersonalizationAllowed = product?.personalization_enabled === true;
  const reviewCount = reviews.length;
  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return Math.round((total / reviews.length) * 10) / 10;
  }, [reviews]);
  const roundedAverageRating = Math.round(averageRating);
  const loggedReviewerName = useMemo(() => {
    if (!user) return '';
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    const metadataName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
    if (metadataName.length >= 2) return metadataName;
    if (user.email) return user.email.split('@')[0] || 'Cliente';
    return 'Cliente';
  }, [user]);
  const loggedReviewerPhone = useMemo(() => {
    if (!user) return '';
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    const metadataPhone = typeof metadata.phone === 'string' ? metadata.phone.trim() : '';
    const directPhone = typeof user.phone === 'string' ? user.phone.trim() : '';
    return directPhone || metadataPhone || '';
  }, [user]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatReviewDate = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));

  const openContact = () => {
    if (!product) return;
    if (company?.catalog_contact_url) {
      const link = company.catalog_contact_url.replace('{produto}', product.name);
      window.open(link, '_blank');
      return;
    }
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    const message = `Ola! Gostaria de saber mais sobre o produto: ${product.name}`;
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

  const openCart = () => {
    if (!company) return;
    const href = company.slug ? `/catalogo/${company.slug}/carrinho` : `/catalogo/carrinho/${company.id}`;
    navigate(href);
  };

  const handleAddToCart = (mode: 'sum' | 'replace' = 'sum') => {
    if (!company || !product) return;

    const minimumQuantity = Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1));
    const quantity = Math.max(minimumQuantity, Number(orderForm.quantity || minimumQuantity));
    const notes = isPersonalizationAllowed ? orderForm.customization.trim() : '';

    upsertPublicCartItem(
      company.id,
      {
        productId: product.id,
        productSlug: product.slug || null,
        name: product.name,
        imageUrl: product.image_url,
        unitPrice,
        quantity,
        minOrderQuantity: minimumQuantity,
        notes: notes || null,
      },
      mode,
    );

    setCartItemsCount(getPublicCartItemsCount(company.id));
    toast({
      title: 'Produto adicionado',
      description: `${product.name} foi adicionado ao carrinho.`,
    });
  };

  const handleGoToCheckout = () => {
    handleAddToCart('replace');
    openCart();
  };

  const handleReviewFieldChange = (field: 'name' | 'phone' | 'comment', value: string) => {
    setReviewForm((prev) => ({ ...prev, [field]: value }));
    if (reviewError) setReviewError(null);
  };

  const handleReviewRatingChange = (value: number) => {
    setReviewForm((prev) => ({ ...prev, rating: value }));
    if (reviewError) setReviewError(null);
  };

  const handleReviewImagesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith('image/')
    );
    if (incoming.length === 0) return;

    if (reviewFiles.length + incoming.length > 3) {
      setReviewError('Voce pode enviar no maximo 3 imagens por avaliacao.');
      event.target.value = '';
      return;
    }

    const previews = incoming.map((file) => URL.createObjectURL(file));
    setReviewFiles((prev) => [...prev, ...incoming]);
    setReviewImagePreviews((prev) => [...prev, ...previews]);
    if (reviewError) setReviewError(null);
    event.target.value = '';
  };

  const removeReviewImage = (index: number) => {
    setReviewFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setReviewImagePreviews((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target);
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const resetReviewImages = () => {
    reviewImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setReviewFiles([]);
    setReviewImagePreviews([]);
  };

  const openReviewImage = (url: string) => {
    setSelectedReviewImage(url);
  };

  const closeReviewImage = () => {
    setSelectedReviewImage(null);
  };

  const handleReviewSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !product) return;

    const reviewerName = user ? loggedReviewerName.trim() : reviewForm.name.trim();
    const reviewerPhone = user ? loggedReviewerPhone.trim() : reviewForm.phone.trim();
    const comment = reviewForm.comment.trim();

    if (reviewerName.length < 2) {
      setReviewError('Informe seu nome para publicar a avaliacao.');
      return;
    }

    if (reviewForm.rating < 1 || reviewForm.rating > 5) {
      setReviewError('Selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);
    const reviewClient = user ? customerSupabase : publicSupabase;

    const uploadedImageUrls: string[] = [];
    for (const [index, file] of reviewFiles.entries()) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const objectPath = `${company.id}/${product.id}/${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 10)}.${extension}`;

      const { error: uploadError } = await reviewClient.storage
        .from('product-review-images')
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: '3600',
        });

      if (uploadError) {
        setReviewSubmitting(false);
        setReviewError('Nao foi possivel enviar as imagens da avaliacao.');
        toast({
          title: 'Erro ao enviar imagens',
          description: 'Nao foi possivel enviar as imagens da avaliacao.',
          variant: 'destructive',
        });
        return;
      }

      const { data: publicUrlData } = reviewClient.storage
        .from('product-review-images')
        .getPublicUrl(objectPath);
      if (publicUrlData.publicUrl) uploadedImageUrls.push(publicUrlData.publicUrl);
    }

    const { data, error } = await reviewClient
      .from('product_reviews')
      .insert({
        company_id: company.id,
        product_id: product.id,
        reviewer_name: reviewerName,
        reviewer_phone: reviewerPhone || null,
        rating: reviewForm.rating,
        comment: comment || null,
        review_image_urls: uploadedImageUrls,
        user_id: user?.id || null,
      })
      .select('*')
      .single();

    if (error) {
      setReviewSubmitting(false);
      setReviewError('Nao foi possivel enviar sua avaliacao agora. Tente novamente.');
      toast({
        title: 'Erro ao enviar avaliacao',
        description: 'Nao foi possivel enviar sua avaliacao agora.',
        variant: 'destructive',
      });
      return;
    }

    setReviews((prev) => [data as ProductReview, ...prev]);
    setReviewForm({ name: '', phone: '', rating: 0, comment: '' });
    resetReviewImages();
    setReviewSubmitting(false);
    toast({
      title: 'Avaliacao enviada',
      description: 'Obrigado por avaliar este produto.',
    });
  };

  const showPrices = company?.catalog_show_prices ?? true;
  const showContact = company?.catalog_show_contact ?? true;
  const catalogHref = company?.slug
    ? `/catalogo/${company.slug}`
    : company?.id
      ? `/loja/${company.id}`
      : slug
        ? `/catalogo/${slug}`
        : '/catalogo';

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(catalogHref);
  };

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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Produto nao encontrado</h1>
          <p className="text-slate-500 mb-4">Este produto nao existe ou nao esta disponivel.</p>
          <Link to={catalogHref}>
            <Button>Voltar ao catalogo</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-detail-root min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        .catalog-detail-root {
          --cd-light: #f4f6fb;
          --cd-white: #ffffff;
          --cd-border: #e2e7f5;
          --cd-muted: #7a8299;
          --cd-text: #0f1b3d;
          --cd-primary: #1a3a8f;
          --cd-primary-text: #ffffff;
          --cd-outline: #1a3a8f;
          --cd-badge-bg: #c9a84c;
          --cd-badge-text: #2f2406;
          --cd-price: #1a3a8f;
          --cd-card-bg: #ffffff;
          --cd-card-border: #e2e7f5;
          --cd-header-bg: #0f1b3d;
          --cd-header-text: #ffffff;
          --cd-footer-bg: #0f1b3d;
          --cd-footer-text: #ffffff;
          background: var(--cd-light);
          color: var(--cd-text);
        }

        .catalog-detail-header {
          backdrop-filter: blur(10px);
          background: var(--cd-header-bg);
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
          color: var(--cd-header-text);
          height: 68px;
        }

        .pc-container {
          width: min(1220px, calc(100% - 40px));
          margin: 0 auto;
        }

        .pc-nav-inner {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .pc-nav-left {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        .pc-back-btn {
          border: 0;
          background: transparent;
          color: var(--cd-header-text);
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          opacity: 0.92;
          transition: opacity 0.2s ease;
        }

        .pc-back-btn:hover {
          opacity: 1;
        }

        .pc-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .pc-brand-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #3d8bef;
          color: var(--cd-primary-text);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .pc-brand-name {
          font-family: inherit;
          font-weight: 700;
          font-size: 1.03rem;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pc-brand-sub {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pc-nav-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .pc-cart-chip {
          height: 36px;
          border-radius: 50px;
          border: 1px solid rgba(255, 255, 255, 0.4);
          background: rgba(255, 255, 255, 0.08);
          color: var(--cd-primary-text);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 14px;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
        }

        .pc-whatsapp-btn {
          height: 36px;
          border: 0;
          border-radius: 12px;
          background: var(--cd-primary);
          color: var(--cd-primary-text);
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          padding: 0 15px;
          cursor: pointer;
          transition: opacity 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .pc-whatsapp-btn:hover {
          opacity: 0.9;
        }

        .pc-hero {
          position: relative;
          overflow: hidden;
          background: var(--cd-primary);
          color: var(--cd-primary-text);
        }

        .pc-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(255, 255, 255, 0.22) 1px, transparent 1px);
          background-size: 16px 16px;
          opacity: 0.38;
          pointer-events: none;
        }

        .pc-hero-inner {
          position: relative;
          z-index: 1;
          padding: 28px 0 30px;
        }

        .pc-hero-tag {
          display: inline-flex;
          align-items: center;
          height: 28px;
          border-radius: 50px;
          background: #c9a84c;
          color: #2f2406;
          font-size: 12px;
          font-weight: 500;
          padding: 0 12px;
          margin-bottom: 10px;
        }

        .pc-title {
          font-family: inherit;
          font-size: clamp(1.8rem, 4vw, 2.75rem);
          line-height: 1.12;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .pc-subtitle {
          max-width: 820px;
          font-size: 15px;
          font-weight: 300;
          color: rgba(255, 255, 255, 0.88);
          margin-bottom: 14px;
        }

        .pc-contact-row {
          display: flex;
          flex-wrap: wrap;
          gap: 14px 20px;
          font-size: 14px;
        }

        .pc-contact-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.95);
        }

        .catalog-detail-main {
          width: min(1160px, calc(100% - 28px));
          margin: 0 auto;
        }

        .catalog-detail-hero {
          align-items: start;
          gap: 1.25rem;
        }

        .catalog-detail-media {
          display: flex;
          flex-direction: column;
        }

        .catalog-detail-media-frame {
          min-height: clamp(280px, 64vw, 520px);
          height: clamp(280px, 64vw, 520px);
          max-height: clamp(280px, 64vw, 520px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
        }

        .catalog-detail-media-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          background: #f8fafc;
        }

        .catalog-detail-hero > div:first-child {
          border: 1px solid var(--cd-border);
          border-radius: 1rem;
          padding: 0.85rem;
          background: var(--cd-white);
        }

        .catalog-detail-hero > div:last-child {
          border: 1px solid var(--cd-border);
          border-radius: 1rem;
          background: var(--cd-white);
          padding: 1.1rem;
        }

        .catalog-detail-info {
          display: flex;
          flex-direction: column;
        }

        .catalog-detail-buybox {
          margin-top: auto;
          border: 1px solid var(--cd-border);
          border-radius: 0.9rem;
          background: #fbfcff;
          padding: 1rem;
        }

        .catalog-detail-tabs {
          border-color: var(--cd-border) !important;
          border-radius: 1rem;
          background: var(--cd-card-bg);
          box-shadow: 0 10px 32px rgba(15, 27, 61, 0.05);
        }

        .catalog-detail-tabs > div:first-child {
          background: #fbfcff;
          border-color: var(--cd-border) !important;
          padding: 0.65rem;
          gap: 0.45rem;
        }

        .catalog-detail-tabs > div:first-child > button {
          border: 1px solid var(--cd-border);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          color: var(--cd-muted);
          padding: 0.4rem 0.9rem;
        }

        .catalog-detail-tabs > div:first-child > button.text-primary {
          background: var(--cd-primary);
          border-color: var(--cd-primary);
          color: var(--cd-primary-text);
        }

        .catalog-detail-order .catalog-card {
          border-color: var(--cd-card-border);
          border-radius: 1rem;
          background: var(--cd-card-bg);
          box-shadow: 0 10px 32px rgba(15, 27, 61, 0.05);
        }

        .catalog-detail-related a .bg-white {
          border-color: var(--cd-border) !important;
          border-radius: 0.9rem;
        }

        .catalog-detail-company {
          border-color: var(--cd-card-border);
          border-radius: 1rem;
          background: var(--cd-card-bg);
          box-shadow: 0 8px 24px rgba(15, 27, 61, 0.04);
        }

        .pc-footer {
          background: var(--cd-footer-bg);
          color: var(--cd-footer-text);
          padding-top: 24px;
          margin-top: 26px;
        }

        .pc-footer-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.18);
        }

        .pc-footer-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pc-footer-btn {
          height: 40px;
          border-radius: 12px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          padding: 0 16px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s ease;
          cursor: pointer;
        }

        .pc-footer-btn:hover {
          opacity: 0.9;
        }

        .pc-footer-btn-outline {
          border: 1px solid rgba(255, 255, 255, 0.58);
          color: var(--cd-footer-text);
          background: transparent;
        }

        .pc-footer-btn-primary {
          border: 0;
          color: var(--cd-primary-text);
          background: #3d8bef;
        }

        .pc-footer-copy {
          text-align: center;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          padding: 15px 0 18px;
        }

        .catalog-detail-root input,
        .catalog-detail-root .catalog-input,
        .catalog-detail-root [data-radix-select-trigger] {
          border-color: var(--cd-border) !important;
          border-radius: 0.65rem !important;
          background: var(--cd-white);
        }

        .catalog-btn {
          background-color: var(--cd-primary);
          color: var(--cd-primary-text);
          border-radius: 0.7rem;
          border: 0;
          font-weight: 700;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .catalog-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .catalog-btn-outline {
          border-color: var(--cd-outline);
          color: var(--cd-outline);
          border-radius: 0.7rem;
          font-weight: 700;
          background: var(--cd-white);
          transition: all 0.2s ease;
        }

        .catalog-btn-outline:hover {
          background-color: var(--cd-outline);
          color: var(--cd-primary-text);
        }

        .catalog-card {
          background-color: var(--cd-card-bg);
          border-color: var(--cd-card-border);
        }

        .catalog-badge {
          background-color: var(--cd-badge-bg);
          color: var(--cd-badge-text);
        }

        .catalog-price {
          color: var(--cd-price);
        }

        @media (max-width: 1023px) {
          .pc-container {
            width: min(1220px, calc(100% - 24px));
          }

          .catalog-detail-main {
            width: calc(100% - 18px);
          }

          .pc-footer-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .pc-footer-actions {
            justify-content: flex-start;
          }
        }

        @media (min-width: 1024px) {
          .catalog-detail-hero {
            align-items: start;
          }

          .catalog-detail-media-frame {
            min-height: 460px;
            height: 460px;
            max-height: 460px;
          }

          .catalog-detail-info {
            min-height: 460px;
          }

          .catalog-detail-buybox {
            position: sticky;
            top: 86px;
          }
        }

        @media (max-width: 720px) {
          .pc-container {
            width: calc(100% - 16px);
          }

          .pc-brand-sub {
            display: none;
          }

          .pc-cart-chip {
            padding: 0 10px;
            font-size: 12px;
          }

          .pc-whatsapp-btn {
            padding: 0 12px;
            font-size: 13px;
          }

          .catalog-detail-hero > div:last-child {
            padding: 0.9rem;
          }
        }
      `}</style>

      <header className="catalog-detail-header sticky top-0 z-40 border-b">
        <div className="pc-container pc-nav-inner">
          <div className="pc-nav-left">
            <button type="button" className="pc-back-btn" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="pc-brand">
              <span className="pc-brand-avatar">{initials(company?.name)}</span>
              <div>
                <p className="pc-brand-name">{company?.name || 'Catalogo'}</p>
                {company?.city && company?.state && (
                  <p className="pc-brand-sub">{company.city}, {company.state}</p>
                )}
              </div>
            </div>
          </div>
          <div className="pc-nav-right">
            <button type="button" className="pc-cart-chip" onClick={openCart}>
              <ShoppingCart className="h-4 w-4" />
              {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'itens'}
            </button>
            {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
              <button type="button" className="pc-whatsapp-btn" onClick={openContact}>
                <Whatsapp className="h-4 w-4" />
                <span>WhatsApp</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="pc-hero">
        <div className="pc-container pc-hero-inner">
          <span className="pc-hero-tag">Detalhes do produto</span>
          <h1 className="pc-title">{product.name}</h1>
          <p className="pc-subtitle">
            {product.catalog_short_description || product.description || 'Descricao detalhada do produto.'}
          </p>
          <div className="pc-contact-row">
            {company?.phone && (
              <span className="pc-contact-item">
                <Phone className="h-4 w-4" /> {company.phone}
              </span>
            )}
            {company?.email && (
              <span className="pc-contact-item">
                <Mail className="h-4 w-4" /> {company.email}
              </span>
            )}
            {company?.address && (
              <span className="pc-contact-item">
                <MapPin className="h-4 w-4" /> {company.address}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="catalog-detail-main mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
          <Link to={catalogHref} className="hover:text-slate-600">Catalogo</Link>
          <ChevronRight className="h-3 w-3" />
          <span>{product.category?.name || 'Catalogo'}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600 font-medium">{product.name}</span>
        </div>

        <div className="catalog-detail-hero grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="catalog-detail-media space-y-4">
            <div className="catalog-detail-media-frame relative overflow-hidden rounded-2xl">
              {isPromotionActive(product as Product) && (
                <Badge className="absolute top-4 left-4 catalog-badge">Novidade</Badge>
              )}
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={product.name}
                  className="catalog-detail-media-image"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-800">
                  <Package className="h-16 w-16 text-white/30" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {thumbnailImages.map((url, index) => (
                <button
                  key={`${url ?? 'empty'}-${index}`}
                  type="button"
                  className={`h-16 w-16 rounded-lg border ${index === selectedImageIndex ? 'border-primary' : 'border-slate-200'} bg-white overflow-hidden`}
                  onClick={() => {
                    if (url) setSelectedImageIndex(index);
                  }}
                  disabled={!url}
                >
                  {url ? (
                    <img src={url} alt={`thumb ${index + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="catalog-detail-info space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{product.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-1 text-yellow-500">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className={`h-4 w-4 ${index < roundedAverageRating ? 'fill-yellow-400' : ''}`} />
                  ))}
                </div>
                {reviewCount > 0 ? (
                  <span>{averageRating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? 'avaliacao' : 'avaliacoes'})</span>
                ) : (
                  <span>Sem avaliacoes</span>
                )}
                <Badge variant="secondary">Em estoque</Badge>
              </div>
            </div>

            <div className="catalog-detail-buybox space-y-4">
              {showPrices ? (
                promoBasePrice !== null ? (
                  <div className="flex flex-col gap-1">
                    <div className="text-sm text-slate-500">
                      <span className="mr-1">De</span>
                      <span className="line-through">{formatCurrency(promoBasePrice)}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-slate-500">Por</span>
                      <span className="text-3xl font-bold catalog-price">{formatCurrency(unitPrice)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold catalog-price">{formatCurrency(unitPrice)}</span>
                  </div>
                )
              ) : (
                <div className="text-sm text-slate-500">Preco sob consulta</div>
              )}

              {availableColors.length > 0 && (
                <div>
                  <Label className="text-xs uppercase text-slate-500">Cor da Capa</Label>
                  <div className="mt-2 flex gap-2">
                    {availableColors.map((color, index) => (
                      <button
                        key={`${color.name}-${color.hex}`}
                        className={`h-8 rounded-full border px-3 text-xs font-medium ${
                          index === selectedColorIndex
                            ? 'border-primary bg-primary text-white'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                        aria-label={color.name}
                        onClick={() => setSelectedColorIndex(index)}
                      >
                        {color.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isPersonalizationAllowed && (
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
                      setOrderForm((prev) => ({ ...prev, customization: event.target.value.slice(0, 20) }))
                    }
                  />
                  <p className="mt-1 text-xs text-slate-400">Maximo de 20 caracteres.</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex items-center border border-slate-200 rounded-lg bg-white h-10 w-28">
                  <button
                    type="button"
                    className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-700"
                    onClick={() =>
                      setOrderForm((prev) => ({
                        ...prev,
                        quantity: Math.max(1, prev.quantity - 1),
                      }))
                    }
                    aria-label="Diminuir"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="flex-1 text-center text-sm font-medium">{orderForm.quantity}</span>
                  <button
                    type="button"
                    className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-700"
                    onClick={() =>
                      setOrderForm((prev) => ({
                        ...prev,
                        quantity: prev.quantity + 1,
                      }))
                    }
                    aria-label="Aumentar"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <Button className="flex-1 catalog-btn" onClick={() => handleAddToCart('sum')}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Adicionar ao carrinho
                </Button>
                <Button className="flex-1 catalog-btn" onClick={handleGoToCheckout}>
                  Fazer Pedido
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Compra segura</span>
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Frete gratis acima de R$199</span>
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Garantia de qualidade</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
                  <Button variant="outline" className="catalog-btn-outline" onClick={openContact}>
                    <Whatsapp className="h-4 w-4 mr-2" />
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

        <div className="catalog-detail-tabs mt-12 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap border-b border-slate-200 text-sm">
            {[
              { id: 'descricao', label: 'Descricao detalhada' },
              { id: 'especificacoes', label: 'Especificacoes tecnicas' },
              { id: 'envio', label: 'Envio e prazos' },
              { id: 'avaliacoes', label: `Avaliacoes (${reviewCount})` },
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
                <p><strong>SKU:</strong> {product.sku || 'Nao informado'}</p>
                <p><strong>Codigo de barras:</strong> {product.barcode || 'Nao informado'}</p>
                <p><strong>Unidade:</strong> {product.unit || 'Nao informada'}</p>
                <p><strong>Quantidade minima:</strong> {minimumOrderQuantity}</p>
              </div>
            )}
            {activeTab === 'envio' && (
              <div className="text-sm text-slate-600">
                Consulte prazos e modalidades de entrega com a equipe. Pedidos acima de R$199 possuem frete gratis.
              </div>
            )}
            {activeTab === 'avaliacoes' && (
              <div className="space-y-5">
                <form onSubmit={handleReviewSubmit} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <h4 className="font-semibold text-slate-800">Deixe sua avaliacao</h4>
                    <p className="text-xs text-slate-500 mt-1">Compartilhe sua experiencia com este produto.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {!user && (
                      <>
                        <div>
                          <Label htmlFor="review-name">Nome *</Label>
                          <Input
                            id="review-name"
                            value={reviewForm.name}
                            onChange={(event) => handleReviewFieldChange('name', event.target.value)}
                            placeholder="Seu nome"
                          />
                        </div>

                        <div>
                          <Label htmlFor="review-phone">WhatsApp (opcional)</Label>
                          <Input
                            id="review-phone"
                            value={reviewForm.phone}
                            onChange={(event) => handleReviewFieldChange('phone', event.target.value)}
                            placeholder="(00) 00000-0000"
                          />
                        </div>
                      </>
                    )}

                    {user && (
                      <div className="sm:col-span-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        Avaliacao vinculada a sua conta como <strong>{loggedReviewerName}</strong>.
                      </div>
                    )}

                    <div className="sm:col-span-2">
                      <Label>Avaliacao *</Label>
                      <div className="mt-2 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            className="rounded-md p-1 text-amber-500 hover:bg-amber-50"
                            onClick={() => handleReviewRatingChange(rating)}
                            aria-label={`Avaliar com ${rating} estrela${rating > 1 ? 's' : ''}`}
                          >
                            <Star className={`h-5 w-5 ${rating <= reviewForm.rating ? 'fill-amber-400' : ''}`} />
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-slate-500">
                          {reviewForm.rating > 0 ? `${reviewForm.rating} de 5` : 'Selecione de 1 a 5'}
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor="review-comment">Comentario (opcional)</Label>
                      <textarea
                        id="review-comment"
                        className="mt-2 min-h-[86px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={reviewForm.comment}
                        maxLength={600}
                        onChange={(event) => handleReviewFieldChange('comment', event.target.value)}
                        placeholder="Conte o que voce achou do produto..."
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor="review-images">Imagens (ate 3)</Label>
                      <Input
                        id="review-images"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleReviewImagesChange}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Envie fotos reais do produto para ajudar outros clientes.
                      </p>
                      {reviewImagePreviews.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {reviewImagePreviews.map((previewUrl, index) => (
                            <div key={`${previewUrl}-${index}`} className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
                              <img
                                src={previewUrl}
                                alt={`Preview ${index + 1}`}
                                className="h-24 w-full object-contain bg-slate-50 p-1"
                              />
                              <button
                                type="button"
                                className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-[10px] text-white"
                                onClick={() => removeReviewImage(index)}
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {reviewError && <p className="text-xs text-destructive">{reviewError}</p>}

                  <div className="flex justify-end">
                    <Button type="submit" className="catalog-btn" disabled={reviewSubmitting}>
                      {reviewSubmitting ? 'Enviando...' : 'Enviar avaliacao'}
                    </Button>
                  </div>
                </form>

                {reviewsLoading ? (
                  <p className="text-sm text-slate-500">Carregando avaliacoes...</p>
                ) : reviewCount === 0 ? (
                  <div className="text-sm text-slate-600">Ainda nao ha avaliacoes para este produto.</div>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((review) => (
                      <article key={review.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-800">{review.reviewer_name}</p>
                            <div className="mt-1 flex items-center gap-1 text-amber-500">
                              {Array.from({ length: 5 }).map((_, index) => (
                                <Star
                                  key={`${review.id}-${index}`}
                                  className={`h-4 w-4 ${index < review.rating ? 'fill-amber-400' : ''}`}
                                />
                              ))}
                            </div>
                          </div>
                          <span className="text-xs text-slate-500">{formatReviewDate(review.created_at)}</span>
                        </div>
                        {review.comment && (
                          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{review.comment}</p>
                        )}
                        {review.review_image_urls && review.review_image_urls.length > 0 && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {review.review_image_urls.slice(0, 3).map((imageUrl, imageIndex) => (
                              <button
                                key={`${review.id}-image-${imageIndex}`}
                                type="button"
                                onClick={() => openReviewImage(imageUrl)}
                                className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-primary/40"
                                aria-label={`Abrir imagem ${imageIndex + 1} da avaliacao`}
                              >
                                <img
                                  src={imageUrl}
                                  alt={`Imagem da avaliacao ${imageIndex + 1}`}
                                  className="h-24 w-full object-contain bg-white p-1"
                                  loading="lazy"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <>
            <Separator className="my-12" />
            <div className="catalog-detail-related">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Compre junto</h2>
                <Link to={catalogHref} className="text-xs text-primary">Ver catalogo completo</Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {relatedProducts.map((related) => (
                  <Link
                    key={related.id}
                    to={
                      company?.slug
                        ? `/catalogo/${company.slug}/produto/${related.slug?.trim() ? related.slug : related.id}`
                        : `/catalogo/produto/${related.id}`
                    }
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
                          isPromotionActive(related) ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-slate-400 line-through">
                                De {formatCurrency(resolveProductBasePrice(related as Product, 1, [], 0))}
                              </span>
                              <span className="text-sm font-bold catalog-price">
                                Por {formatCurrency(resolveProductPrice(related as Product, 1, [], 0))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-bold catalog-price">
                              {formatCurrency(resolveProductPrice(related as Product, 1, [], 0))}
                            </span>
                          )
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
        <Card className="catalog-detail-company catalog-card border">
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
                <Link to={catalogHref}>
                  <Button size="sm" className="catalog-btn w-full sm:w-auto">
                    Ver catalogo completo
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="pc-footer">
        <div className="pc-container">
          <div className="pc-footer-top">
            <div className="pc-brand">
              <span className="pc-brand-avatar">{initials(company?.name)}</span>
              <div>
                <p className="pc-brand-name">{company?.name || 'Catalogo'}</p>
                {company?.city && company?.state && (
                  <p className="pc-brand-sub">{company.city}, {company.state}</p>
                )}
              </div>
            </div>

            <div className="pc-footer-actions">
              {company?.phone && (
                <a href={`tel:${company.phone}`} className="pc-footer-btn pc-footer-btn-outline">
                  <Phone className="h-4 w-4" /> Ligar
                </a>
              )}

              {company?.email && (
                <a href={`mailto:${company.email}`} className="pc-footer-btn pc-footer-btn-outline">
                  <Mail className="h-4 w-4" /> E-mail
                </a>
              )}

              {showContact && (company?.catalog_contact_url || company?.whatsapp) ? (
                <button type="button" className="pc-footer-btn pc-footer-btn-primary" onClick={openContact}>
                  <Whatsapp className="h-4 w-4" /> WhatsApp
                </button>
              ) : (
                <Link to={catalogHref} className="pc-footer-btn pc-footer-btn-primary">
                  Ver Catalogo Completo
                </Link>
              )}
            </div>
          </div>
          <p className="pc-footer-copy">(c) {new Date().getFullYear()} {company?.name}. Todos os direitos reservados.</p>
        </div>
      </footer>

      {selectedReviewImage && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          onClick={closeReviewImage}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizacao de imagem da avaliacao"
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl items-center justify-center rounded-lg bg-slate-900 p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md bg-black/70 px-3 py-1 text-xs font-medium text-white hover:bg-black/85"
              onClick={closeReviewImage}
            >
              Fechar
            </button>
            <img
              src={selectedReviewImage}
              alt="Imagem ampliada da avaliacao"
              className="max-h-[86vh] w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
