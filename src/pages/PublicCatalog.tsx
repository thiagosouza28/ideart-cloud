import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Instagram, Facebook, MessageCircle, Package, Building2, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Company, Product, Category } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveSuggestedPrice } from '@/lib/pricing';
import { BannerCarousel } from '@/components/BannerCarousel';

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
}

export default function PublicCatalog() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<CompanyWithColors | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc');

  useEffect(() => {
    const loadCatalog = async () => {
      if (!slug) return;

      // Load company
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

      // Load products for this company that are in catalog
      const { data: productsData } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('company_id', companyData.id)
        .eq('show_in_catalog', true)
        .eq('is_active', true)
        .order('name');

      const mappedProducts = (productsData as Product[] || []).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));
      setProducts(mappedProducts);

      // Get unique categories from products
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

  const getProductPrice = (product: Product) =>
    resolveSuggestedPrice(product, 1, [], 0);

  const filteredProducts = (selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products
  ).sort((a, b) => {
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const openWhatsApp = (product?: Product) => {
    if (!company?.whatsapp) return;
    const phone = company.whatsapp.replace(/\D/g, '');
    const message = product
      ? `Olá! Gostaria de saber mais sobre o produto: ${product.name}`
      : `Olá! Vim pelo catálogo online e gostaria de mais informações.`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
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
  const filterBgColor = company?.catalog_filter_bg_color || baseButtonColor;
  const filterTextColor = company?.catalog_filter_text_color || '#ffffff';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando catálogo...</div>
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
            <Button>Voltar ao início</Button>
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
        .catalog-primary-border { border-color: ${buttonBgColor}; }
        .catalog-secondary { color: ${headerBgColor}; }
        .catalog-secondary-bg { background-color: ${headerBgColor}; }
        .catalog-accent { color: ${priceColor}; }
        .catalog-accent-bg { background-color: ${priceColor}; }
        .catalog-text { color: ${textColor}; }
        .catalog-text .text-foreground,
        .catalog-text .text-muted-foreground { color: ${textColor}; }
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
        .catalog-filter {
          background-color: ${filterBgColor};
          color: ${filterTextColor};
        }
        .catalog-filter-outline {
          border-color: ${filterBgColor};
          color: ${filterBgColor};
        }
        .catalog-filter-outline:hover {
          background-color: ${filterBgColor};
          color: ${filterTextColor};
        }
        .catalog-card {
          background-color: ${cardBgColor};
          border-color: ${cardBorderColor};
        }
        .catalog-badge {
          background-color: ${badgeBgColor};
          color: ${badgeTextColor};
        }
      `}</style>

      {/* Header */}
      <header className="border-b sticky top-0 z-10" style={{ backgroundColor: headerBgColor, color: headerTextColor }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {company?.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="w-12 h-12 object-cover rounded-lg bg-white/10" />
              ) : (
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold">{company?.name}</h1>
                {company?.city && company?.state && (
                  <p className="text-sm opacity-80">{company.city}, {company.state}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Product Counter */}
              <Badge
                variant="secondary"
                className="hidden sm:flex bg-white/20 border-0"
                style={{ color: headerTextColor }}
              >
                <Package className="h-3 w-3 mr-1" />
                {products.length} {products.length === 1 ? 'produto' : 'produtos'}
              </Badge>
              {company?.whatsapp && (
                <Button
                  onClick={() => openWhatsApp()}
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
        {company && <BannerCarousel companyId={company.id} position="catalog" />}
        {/* Company Info */}
        {company?.description && (
          <div className="mb-8">
            <p className="text-muted-foreground max-w-2xl">{company.description}</p>
          </div>
        )}

        {/* Contact Info */}
        <div className="flex flex-wrap gap-4 mb-8">
          {company?.phone && (
            <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="h-4 w-4" />
              {company.phone}
            </a>
          )}
          {company?.email && (
            <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="h-4 w-4" />
              {company.email}
            </a>
          )}
          {company?.address && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {company.address}
            </span>
          )}
          {company?.instagram && (
            <a href={`https://instagram.com/${company.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Instagram className="h-4 w-4" />
              {company.instagram}
            </a>
          )}
        </div>

        <Separator className="mb-8" />

        {/* Product Counter Mobile + Category Filter + Layout Toggle */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Badge
            variant="outline"
            className="sm:hidden"
            style={{ color: filterBgColor, borderColor: filterBgColor }}
          >
            <Package className="h-3 w-3 mr-1" />
            {products.length} {products.length === 1 ? 'produto' : 'produtos'}
          </Badge>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 flex-1">
              <Button
                variant={selectedCategory === null ? 'default' : 'outline'}
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
                    variant={selectedCategory === cat.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={selectedCategory === cat.id ? 'catalog-filter' : 'catalog-filter-outline'}
                  >
                    {cat.name} ({count})
                  </Button>
                );
              })}
            </div>
          )}

          {/* Sort Select */}
          <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
            <SelectTrigger className="w-auto min-w-[140px] catalog-filter-outline">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Nome A-Z</SelectItem>
              <SelectItem value="name_desc">Nome Z-A</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
            </SelectContent>
          </Select>

          {/* Layout Toggle */}
          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={`h-8 w-8 p-0 ${viewMode === 'grid' ? 'catalog-filter' : 'catalog-filter-outline'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={`h-8 w-8 p-0 ${viewMode === 'list' ? 'catalog-filter' : 'catalog-filter-outline'}`}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filtered count */}
        {selectedCategory && (
          <p className="text-sm text-muted-foreground mb-4">
            Mostrando {filteredProducts.length} de {products.length} produtos
          </p>
        )}

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum produto disponível no catálogo.</p>
          </div>
        ) : (
          <div className={viewMode === 'grid'
            ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-4"
          }>
            {filteredProducts.map(product => (
              viewMode === 'grid' ? (
                <Link key={product.id} to={`/catalogo/${slug}/produto/${product.id}`}>
                  <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow cursor-pointer h-full catalog-card flex flex-col">
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <h3 className="font-semibold text-foreground mb-2 line-clamp-2 flex-grow">{product.name}</h3>
                      <div className="mt-auto">
                        <span className="text-lg font-bold block mb-3" style={{ color: priceColor }}>
                          {formatCurrency(getProductPrice(product))}
                        </span>
                        <Button className="w-full catalog-btn gap-2">
                          <Package className="h-4 w-4" />
                          Fazer Pedido
                        </Button>
                      </div>
                    </CardContent>
                    {company?.whatsapp && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          openWhatsApp(product);
                        }}
                        className="absolute top-2 right-2 catalog-btn-outline bg-background/80 backdrop-blur-sm"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </Card>
                </Link>
              ) : (
                <Link key={product.id} to={`/catalogo/${slug}/produto/${product.id}`}>
                  <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow cursor-pointer catalog-card">
                    <div className="flex">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 bg-muted relative overflow-hidden flex-shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <CardContent className="flex-1 p-4 flex flex-col justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">{product.name}</h3>
                          <span className="text-lg font-bold" style={{ color: priceColor }}>
                            {formatCurrency(getProductPrice(product))}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <Button className="catalog-btn gap-2" size="sm">
                            <Package className="h-4 w-4" />
                            Fazer Pedido
                          </Button>
                        </div>
                      </CardContent>
                    </div>
                    {company?.whatsapp && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          openWhatsApp(product);
                        }}
                        className="absolute top-2 right-2 catalog-btn-outline bg-background/80 backdrop-blur-sm"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </Card>
                </Link>
              )
            ))}
          </div>
        )}
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
