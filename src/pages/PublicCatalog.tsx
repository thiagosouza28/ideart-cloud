import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  Building2,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Tag
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BannerCarousel } from '@/components/BannerCarousel';
import { supabase } from '@/integrations/supabase/client';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { getBasePrice, isPromotionActive, resolveSuggestedPrice } from '@/lib/pricing';
import { Category, Company, Product } from '@/types/database';

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
  catalog_layout?: 'grid' | 'list';
  catalog_title?: string | null;
  catalog_description?: string | null;
  catalog_share_image_url?: string | null;
  catalog_button_text?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_contact_url?: string | null;
  catalog_font?: string | null;
  catalog_columns_mobile?: number | null;
  catalog_columns_desktop?: number | null;
}

interface ProductWithCategory extends Omit<Product, 'category'> {
  category?: { name: string } | null;
}

export default function PublicCatalog() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyWithColors | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc');

  useEffect(() => {
    const loadCatalog = async () => {
      if (!slug) return;

      const { data: companyData, error } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error || !companyData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const normalizedCompany = {
        ...(companyData as CompanyWithColors),
        logo_url: ensurePublicStorageUrl('product-images', companyData.logo_url),
      };

      setCompany(normalizedCompany);
      setViewMode(normalizedCompany.catalog_layout || 'grid');

      const { data: productsData } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('company_id', companyData.id)
        .or('catalog_enabled.is.true,show_in_catalog.is.true')
        .eq('is_active', true)
        .order('catalog_sort_order', { ascending: true })
        .order('name');

      const mappedProducts = (productsData as unknown as ProductWithCategory[] || []).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));

      setProducts(mappedProducts);

      const uniqueCategoryIds = [...new Set(mappedProducts.map(p => p.category_id).filter(Boolean))];
      if (uniqueCategoryIds.length > 0) {
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('*')
          .in('id', uniqueCategoryIds)
          .order('name');
        setCategories(categoriesData as Category[] || []);
      }

      setLoading(false);
    };

    loadCatalog();
  }, [slug]);

  useEffect(() => {
    if (!company) return;
    const title = company.catalog_title || company.name || 'Catálogo';
    const description = company.catalog_description || `Catálogo de ${company.name}`;
    document.title = title;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && company.catalog_share_image_url) {
      ogImage.setAttribute('content', company.catalog_share_image_url);
    }
  }, [company]);

  const getProductPrice = (product: ProductWithCategory) =>
    product.catalog_price ?? resolveSuggestedPrice(product as unknown as Product, 1, [], 0);

  const filteredProducts = useMemo(() => {
    const scoped = selectedCategory
      ? products.filter(p => p.category_id === selectedCategory)
      : products;

    return [...scoped].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'price_asc':
          return getProductPrice(a) - getProductPrice(b);
        case 'price_desc':
          return getProductPrice(b) - getProductPrice(a);
        default:
          return 0;
      }
    });
  }, [products, selectedCategory, sortBy]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const openContact = (product?: ProductWithCategory) => {
    if (company?.catalog_contact_url) {
      const link = company.catalog_contact_url.replace('{produto}', product?.name || '');
      window.open(link, '_blank');
      return;
    }
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    const message = product
      ? `Olá! Gostaria de saber mais sobre o produto: ${product.name}`
      : 'Olá! Vim pelo catálogo online e gostaria de mais informações.';
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const baseButtonColor = company?.catalog_primary_color || '#3b82f6';
  const baseSurfaceColor = company?.catalog_secondary_color || '#1e40af';
  const baseHighlightColor = company?.catalog_accent_color || '#f59e0b';
  const textColor = company?.catalog_text_color || '#111827';
  const headerBgColor = company?.catalog_header_bg_color || baseSurfaceColor;
  const headerTextColor = company?.catalog_header_text_color || '#ffffff';
  const footerBgColor = company?.catalog_footer_bg_color || '#ffffff';
  const footerTextColor = company?.catalog_footer_text_color || '#0f172a';
  const priceColor = company?.catalog_price_color || baseButtonColor;
  const badgeBgColor = company?.catalog_badge_bg_color || baseHighlightColor;
  const badgeTextColor = company?.catalog_badge_text_color || '#ffffff';
  const buttonBgColor = company?.catalog_button_bg_color || '#0f172a';
  const buttonTextColor = company?.catalog_button_text_color || '#ffffff';
  const buttonOutlineColor = company?.catalog_button_outline_color || baseButtonColor;
  const cardBgColor = company?.catalog_card_bg_color || '#ffffff';
  const cardBorderColor = company?.catalog_card_border_color || '#e2e8f0';
  const filterBgColor = company?.catalog_filter_bg_color || baseButtonColor;
  const filterTextColor = company?.catalog_filter_text_color || '#ffffff';
  const showPrices = company?.catalog_show_prices ?? true;
  const showContact = company?.catalog_show_contact ?? true;
  const buttonText = company?.catalog_button_text || 'Fazer Pedido';
  const catalogFont = company?.catalog_font || 'Inter, ui-sans-serif, system-ui, sans-serif';
  const columnsMobile = company?.catalog_columns_mobile || 1;
  const columnsDesktop = company?.catalog_columns_desktop || 4;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando catalogo...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Catálogo não encontrado</h1>
          <p className="text-muted-foreground mb-4">Este catálogo não existe ou não está disponível.</p>
          <Link to="/">
            <Button>Voltar ao inicio</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 catalog-text"
      style={{
        fontFamily: catalogFont,
        ['--catalog-cols-mobile' as any]: String(columnsMobile),
        ['--catalog-cols-desktop' as any]: String(columnsDesktop),
      }}
    >
      <style>{`
        .catalog-text { color: ${textColor}; }
        .catalog-primary { color: ${baseButtonColor}; }
        .catalog-btn { background-color: ${buttonBgColor}; color: ${buttonTextColor}; }
        .catalog-btn:hover { filter: brightness(0.92); }
        .catalog-btn-outline { border-color: ${buttonOutlineColor}; color: ${buttonOutlineColor}; }
        .catalog-btn-outline:hover { background-color: ${buttonOutlineColor}; color: ${buttonTextColor}; }
        .catalog-card { background-color: ${cardBgColor}; border-color: ${cardBorderColor}; }
        .catalog-filter { background-color: ${filterBgColor}; color: ${filterTextColor}; }
        .catalog-filter-outline { border-color: ${filterBgColor}; color: ${filterBgColor}; }
        .catalog-filter-outline:hover { background-color: ${filterBgColor}; color: ${filterTextColor}; }
        .catalog-price { color: ${priceColor}; }
        .catalog-badge { background-color: ${badgeBgColor}; color: ${badgeTextColor}; }
      `}</style>

      <header className="sticky top-0 z-40 border-b shadow-sm" style={{ backgroundColor: headerBgColor, color: headerTextColor }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              className="gap-2 text-xs text-white/90 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-3">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company?.name || 'Logo'}
                  className="w-8 h-8 rounded-full bg-white/20 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
              )}
              <div className="leading-tight">
                <h1 className="font-bold text-sm">{company?.catalog_title || company?.name}</h1>
                {company?.city && company?.state && (
                  <p className="text-xs text-white/70">{company.city}, {company.state}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Badge className="hidden sm:flex bg-white/15 text-white border-0">
              <Package className="h-3 w-3 mr-1" />
              {products.length} {products.length === 1 ? 'produto' : 'produtos'}
            </Badge>
            {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
              <Button
                onClick={() => openContact()}
                size="sm"
                className="gap-2 bg-white/15 hover:bg-white/25 text-white"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {company && (
          <div className="mb-8">
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <BannerCarousel companyId={company.id} position="catalog" />
            </div>
          </div>
        )}

        <div className="mb-8 space-y-4">
          <h2 className="text-lg font-semibold uppercase tracking-wide border-l-4 pl-3" style={{ borderColor: baseButtonColor }}>
            {company?.description || 'Catálogo de produtos'}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm text-slate-500">
            {company?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 catalog-primary" />
                {company.phone}
              </div>
            )}
            {company?.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 catalog-primary" />
                {company.email}
              </div>
            )}
            {company?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 catalog-primary" />
                {company.address}
              </div>
            )}
          </div>
        </div>

        <Separator className="mb-4" />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sticky top-[64px] z-30 bg-slate-50/90 backdrop-blur border-b border-slate-200 py-4">
          <div className="flex gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
            {categories.length > 0 ? (
              <>
                <Button
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className={selectedCategory === null ? 'catalog-filter' : 'catalog-filter-outline'}
                >
                  Todos ({products.length})
                </Button>
                {categories.map(cat => {
                  const count = products.filter(p => p.category_id === cat.id).length;
                  return (
                    <Button
                      key={cat.id}
                      size="sm"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={selectedCategory === cat.id ? 'catalog-filter' : 'catalog-filter-outline'}
                    >
                      {cat.name} ({count})
                    </Button>
                  );
                })}
              </>
            ) : (
              <Button size="sm" className="catalog-filter">Todos ({products.length})</Button>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-auto min-w-[140px] catalog-filter-outline">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nome A-Z</SelectItem>
                <SelectItem value="name_desc">Nome Z-A</SelectItem>
                <SelectItem value="price_asc">Menor preco</SelectItem>
                <SelectItem value="price_desc">Maior preco</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex border rounded-lg overflow-hidden bg-white">
              <Button
                size="sm"
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'catalog-filter' : 'catalog-filter-outline'}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'catalog-filter' : 'catalog-filter-outline'}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Nenhum produto disponivel no catalogo.</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'catalog-grid' : 'flex flex-col gap-4'}>
            {filteredProducts.map(product => (
              viewMode === 'grid' ? (
                <Link
                  key={product.id}
                  to={`/catalogo/${slug}/produto/${product.slug?.trim() ? product.slug : product.id}`}
                >
                  <Card className="relative overflow-hidden group hover:shadow-md transition-shadow flex flex-col h-full catalog-card border">
                    <div className="relative aspect-square overflow-hidden bg-slate-100">
                      {isPromotionActive(product as unknown as Product) && (
                        <span className="absolute top-3 left-3 z-10 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 catalog-badge">
                          <Tag className="h-3 w-3" /> Oferta
                        </span>
                      )}
                      {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            openContact(product);
                          }}
                          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/80 text-slate-500 hover:text-primary"
                          aria-label="Contato"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-16 w-16 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4 flex flex-col flex-grow">
                      <h3 className="font-semibold mb-1 line-clamp-2">{product.name}</h3>
                      {product.catalog_short_description && (
                        <p className="text-sm text-slate-500 line-clamp-2 mb-2">
                          {product.catalog_short_description}
                        </p>
                      )}
                      <div className="mt-auto">
                        {showPrices ? (
                          <div className="flex items-baseline gap-2 mb-3">
                            {isPromotionActive(product as unknown as Product) && (
                              <span className="text-xs text-slate-400 line-through">
                                {formatCurrency(getBasePrice(product as unknown as Product))}
                              </span>
                            )}
                            <span className="text-lg font-bold catalog-price">
                              {formatCurrency(getProductPrice(product))}
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500 mb-3">Preco sob consulta</div>
                        )}
                        <Button className="w-full catalog-btn gap-2">
                          <Package className="h-4 w-4" />
                          {buttonText}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Link
                  key={product.id}
                  to={`/catalogo/${slug}/produto/${product.slug?.trim() ? product.slug : product.id}`}
                >
                  <Card className="relative overflow-hidden group hover:shadow-md transition-shadow catalog-card border">
                    <div className="flex">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 bg-slate-100 overflow-hidden flex-shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <CardContent className="flex-1 p-4 flex flex-col justify-between">
                        <div>
                          <h3 className="font-semibold mb-1">{product.name}</h3>
                          {product.catalog_short_description && (
                            <p className="text-sm text-slate-500 line-clamp-2 mb-2">
                              {product.catalog_short_description}
                            </p>
                          )}
                          {showPrices ? (
                            <span className="text-lg font-bold catalog-price">
                              {formatCurrency(getProductPrice(product))}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">Preco sob consulta</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Button className="catalog-btn gap-2" size="sm">
                            <Package className="h-4 w-4" />
                            {buttonText}
                          </Button>
                          {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                openContact(product);
                              }}
                              className="catalog-btn-outline"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                </Link>
              )
            ))}
          </div>
        )}
      </main>

      <footer className="border-t" style={{ backgroundColor: footerBgColor, color: footerTextColor }}>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company?.name || 'Logo'}
                  className="w-10 h-10 rounded-full bg-slate-200 object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              <div>
                <h4 className="font-bold">{company?.name}</h4>
                {company?.city && company?.state && (
                  <p className="text-xs text-slate-500">{company.city}, {company.state}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              {company?.phone && (
                <a
                  href={`tel:${company.phone}`}
                  className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Phone className="h-4 w-4" />
                  Ligar
                </a>
              )}
              {company?.email && (
                <a
                  href={`mailto:${company.email}`}
                  className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  E-mail
                </a>
              )}
              <Link
                to={`/catalogo/${slug}`}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                Ver Catálogo Completo
              </Link>
            </div>
          </div>
          <div className="border-t mt-8 pt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} {company?.name}. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
