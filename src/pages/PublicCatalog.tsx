import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { isPromotionActive, resolveProductBasePrice, resolveProductPrice } from '@/lib/pricing';
import { Category, Company, Product } from '@/types/database';

interface CompanyWithCatalog extends Company {
  catalog_layout?: 'grid' | 'list' | null;
  catalog_title?: string | null;
  catalog_description?: string | null;
  catalog_share_image_url?: string | null;
  catalog_button_text?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_contact_url?: string | null;
}

interface ProductWithCategory extends Omit<Product, 'category'> {
  category?: { name: string } | null;
}

type SortMode = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
type ViewMode = 'grid' | 'list';

const pageStyles = `
.pc-page {
  --pc-navy: #0f1b3d;
  --pc-blue: #1a3a8f;
  --pc-accent: #3d8bef;
  --pc-gold: #c9a84c;
  --pc-light: #f4f6fb;
  --pc-white: #ffffff;
  --pc-muted: #7a8299;
  --pc-border: #e2e7f5;
  min-height: 100vh;
  background: var(--pc-light);
  color: var(--pc-navy);
  font-family: inherit;
}

.pc-container {
  width: min(1220px, calc(100% - 40px));
  margin: 0 auto;
}

.pc-nav {
  position: sticky;
  top: 0;
  z-index: 60;
  height: 68px;
  background: var(--pc-navy);
  color: var(--pc-white);
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  animation: pc-fade-down 0.55s ease both;
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
  color: var(--pc-white);
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
  background: var(--pc-accent);
  color: var(--pc-white);
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
  color: var(--pc-white);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.pc-whatsapp-btn {
  height: 36px;
  border: 0;
  border-radius: 12px;
  background: var(--pc-blue);
  color: var(--pc-white);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  padding: 0 15px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.pc-whatsapp-btn:hover {
  opacity: 0.9;
}

.pc-hero {
  position: relative;
  overflow: hidden;
  background: var(--pc-blue);
  color: var(--pc-white);
  animation: pc-fade-down 0.72s ease both;
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

.pc-hero::after {
  content: '';
  position: absolute;
  right: -90px;
  top: -110px;
  width: 280px;
  height: 280px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

.pc-hero-inner {
  position: relative;
  z-index: 1;
  padding: 30px 0 32px;
}

.pc-hero-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  border-radius: 50px;
  background: var(--pc-gold);
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

.pc-toolbar-wrap {
  position: sticky;
  top: 68px;
  z-index: 45;
  background: var(--pc-white);
  border-bottom: 1px solid var(--pc-border);
  animation: pc-fade-down 0.8s ease both;
}

.pc-toolbar {
  min-height: 74px;
  padding: 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pc-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pc-tab {
  height: 38px;
  border-radius: 50px;
  border: 1px solid var(--pc-border);
  background: var(--pc-white);
  color: var(--pc-blue);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  padding: 0 16px;
  cursor: pointer;
  transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.pc-tab:hover {
  opacity: 0.88;
}

.pc-tab.active {
  background: var(--pc-blue);
  border-color: var(--pc-blue);
  color: var(--pc-white);
}

.pc-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pc-sort-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--pc-border);
  background: var(--pc-white);
  padding: 0 10px;
  color: var(--pc-blue);
}

.pc-sort-select {
  border: 0;
  outline: none;
  background: transparent;
  color: var(--pc-blue);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  min-width: 126px;
}

.pc-view-toggle {
  display: inline-flex;
  border: 1px solid var(--pc-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--pc-white);
}

.pc-view-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-left: 1px solid var(--pc-border);
  background: transparent;
  color: var(--pc-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.pc-view-btn:first-child {
  border-left: 0;
}

.pc-view-btn:hover {
  opacity: 0.88;
}

.pc-view-btn.active {
  background: var(--pc-blue);
  color: var(--pc-white);
}

.pc-main {
  padding: 24px 0 38px;
  animation: pc-fade-up 0.65s ease both;
}

.pc-empty {
  min-height: 320px;
  border: 1px dashed var(--pc-border);
  border-radius: 14px;
  background: var(--pc-white);
  display: grid;
  place-items: center;
  text-align: center;
  padding: 24px;
}

.pc-empty-icon {
  width: 68px;
  height: 68px;
  border-radius: 14px;
  background: var(--pc-blue);
  color: var(--pc-white);
  display: grid;
  place-items: center;
  margin: 0 auto 14px;
  animation: pc-float 2.4s ease-in-out infinite;
}

.pc-empty-title {
  font-family: inherit;
  font-size: clamp(1.25rem, 3vw, 1.7rem);
  font-weight: 700;
  margin-bottom: 6px;
}

.pc-empty-subtitle {
  color: var(--pc-muted);
  margin-bottom: 14px;
}

.pc-empty-btn {
  height: 40px;
  border-radius: 12px;
  border: 0;
  background: var(--pc-blue);
  color: var(--pc-white);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  padding: 0 16px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.pc-empty-btn:hover {
  opacity: 0.9;
}

.pc-products {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.pc-products.pc-list {
  grid-template-columns: 1fr;
  gap: 12px;
}

.pc-product-card {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  background: var(--pc-white);
  border: 1px solid var(--pc-border);
  border-radius: 14px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.pc-product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(15, 27, 61, 0.08);
}

.pc-products.pc-list .pc-product-card {
  flex-direction: row;
}

.pc-image {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #ecf2ff;
  border-bottom: 1px solid var(--pc-border);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex-shrink: 0;
}

.pc-products.pc-list .pc-image {
  width: 120px;
  height: 120px;
  aspect-ratio: auto;
  border-bottom: 0;
  border-right: 1px solid var(--pc-border);
}

.pc-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pc-image-fallback {
  color: var(--pc-muted);
}

.pc-offer {
  position: absolute;
  left: 10px;
  top: 10px;
  border-radius: 50px;
  background: var(--pc-gold);
  color: #2f2406;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
}

.pc-product-body {
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 100%;
  min-width: 0;
}

.pc-product-category {
  color: var(--pc-muted);
  font-size: 12px;
  font-weight: 500;
}

.pc-product-title {
  font-family: inherit;
  font-size: 1.15rem;
  line-height: 1.22;
  font-weight: 700;
}

.pc-product-description {
  color: var(--pc-muted);
  font-size: 13px;
  line-height: 1.45;
  min-height: 38px;
}

.pc-product-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pc-price-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-price-base {
  color: var(--pc-muted);
  font-size: 12px;
  text-decoration: line-through;
}

.pc-price-main {
  color: var(--pc-blue);
  font-size: 1rem;
  font-weight: 700;
}

.pc-buy-pill {
  height: 36px;
  border-radius: 12px;
  background: var(--pc-blue);
  color: var(--pc-white);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.pc-footer {
  background: var(--pc-navy);
  color: var(--pc-white);
  padding-top: 24px;
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
}

.pc-footer-btn:hover {
  opacity: 0.9;
}

.pc-footer-btn-outline {
  border: 1px solid rgba(255, 255, 255, 0.58);
  color: var(--pc-white);
  background: transparent;
}

.pc-footer-btn-primary {
  border: 0;
  color: var(--pc-white);
  background: var(--pc-accent);
}

.pc-footer-copy {
  text-align: center;
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  padding: 15px 0 18px;
}

.pc-loading,
.pc-not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--pc-light);
}

.pc-loading-text {
  color: var(--pc-muted);
  font-weight: 500;
}

.pc-not-found-card {
  width: min(560px, calc(100% - 24px));
  background: var(--pc-white);
  border: 1px solid var(--pc-border);
  border-radius: 14px;
  padding: 22px;
  text-align: center;
}

.pc-not-found-title {
  font-family: inherit;
  font-weight: 700;
  font-size: 1.6rem;
  margin-bottom: 8px;
}

.pc-not-found-subtitle {
  color: var(--pc-muted);
  margin-bottom: 16px;
}

.pc-not-found-btn {
  height: 40px;
  border-radius: 12px;
  border: 0;
  background: var(--pc-blue);
  color: var(--pc-white);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  padding: 0 14px;
  cursor: pointer;
}

@keyframes pc-fade-down {
  from { opacity: 0; transform: translateY(-16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pc-fade-up {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pc-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@media (max-width: 980px) {
  .pc-container {
    width: min(1220px, calc(100% - 24px));
  }

  .pc-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .pc-toolbar-actions {
    justify-content: space-between;
  }

  .pc-footer-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .pc-footer-actions {
    justify-content: flex-start;
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

  .pc-title {
    font-size: clamp(1.6rem, 8vw, 2.1rem);
  }

  .pc-products.pc-list .pc-image {
    width: 96px;
    height: 96px;
  }

  .pc-product-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .pc-buy-pill {
    width: 100%;
  }
}
`;

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const initials = (value?: string | null) => {
  const safe = (value || 'Catalogo').trim();
  if (!safe) return 'C';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function PublicCatalog() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyWithCatalog | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortMode>('name_asc');

  useEffect(() => {
    const loadCatalog = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);

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
        ...(companyData as CompanyWithCatalog),
        logo_url: ensurePublicStorageUrl('product-images', companyData.logo_url),
      };

      setCompany(normalizedCompany);
      setViewMode(normalizedCompany.catalog_layout === 'list' ? 'list' : 'grid');

      const { data: productsData } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('company_id', companyData.id)
        .or('catalog_enabled.is.true,show_in_catalog.is.true')
        .eq('is_active', true)
        .order('catalog_sort_order', { ascending: true })
        .order('name', { ascending: true });

      const mappedProducts = ((productsData || []) as ProductWithCategory[]).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));

      setProducts(mappedProducts);

      const uniqueCategoryIds = [...new Set(mappedProducts.map((item) => item.category_id).filter(Boolean))] as string[];
      if (uniqueCategoryIds.length > 0) {
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('*')
          .in('id', uniqueCategoryIds)
          .order('name', { ascending: true });

        setCategories((categoriesData || []) as Category[]);
      } else {
        setCategories([]);
      }

      setLoading(false);
    };

    void loadCatalog();
  }, [slug]);

  useEffect(() => {
    if (!company) return;

    const title = company.catalog_title || company.name || 'Catalogo';
    const description = company.catalog_description || `Catalogo de ${company.name}`;

    document.title = title;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', description);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', description);

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && company.catalog_share_image_url) {
      ogImage.setAttribute('content', company.catalog_share_image_url);
    }
  }, [company]);

  const getProductPrice = (product: ProductWithCategory) =>
    resolveProductPrice(product as unknown as Product, 1, [], 0);

  const getPromotionBasePrice = (product: ProductWithCategory) =>
    resolveProductBasePrice(product as unknown as Product, 1, [], 0);

  const categoryCount = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((item) => {
      if (!item.category_id) return;
      map.set(item.category_id, (map.get(item.category_id) || 0) + 1);
    });
    return map;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const scoped = selectedCategory
      ? products.filter((item) => item.category_id === selectedCategory)
      : products;

    return [...scoped].sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price_asc') return getProductPrice(a) - getProductPrice(b);
      if (sortBy === 'price_desc') return getProductPrice(b) - getProductPrice(a);
      return 0;
    });
  }, [products, selectedCategory, sortBy]);

  const openContact = (product?: ProductWithCategory) => {
    if (!company) return;

    if (company.catalog_contact_url) {
      const url = company.catalog_contact_url.replace('{produto}', product?.name || '');
      window.open(url, '_blank');
      return;
    }

    if (!company.whatsapp) return;

    const phone = company.whatsapp.replace(/\D/g, '');
    const message = product
      ? `Ola! Gostaria de saber mais sobre o produto: ${product.name}`
      : 'Ola! Vim pelo catalogo online e gostaria de mais informacoes.';

    window.open(
      `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}`,
      '_blank'
    );
  };

  const showPrices = company?.catalog_show_prices ?? true;
  const showContact = company?.catalog_show_contact ?? true;
  const buttonText = company?.catalog_button_text || 'Fazer Pedido';

  if (loading) {
    return (
      <div className="pc-page">
        <style>{pageStyles}</style>
        <div className="pc-loading">
          <p className="pc-loading-text">Carregando catalogo...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="pc-page">
        <style>{pageStyles}</style>
        <div className="pc-not-found">
          <div className="pc-not-found-card">
            <h1 className="pc-not-found-title">Catalogo nao encontrado</h1>
            <p className="pc-not-found-subtitle">Este catalogo nao existe ou nao esta disponivel.</p>
            <button
              type="button"
              className="pc-not-found-btn"
              onClick={() => navigate('/')}
            >
              Voltar ao inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-page">
      <style>{pageStyles}</style>

      <nav className="pc-nav">
        <div className="pc-container pc-nav-inner">
          <div className="pc-nav-left">
            <button
              type="button"
              className="pc-back-btn"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              aria-label="Voltar"
            >
              <ArrowLeft size={16} />
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
            <span className="pc-cart-chip">
              <ShoppingCart size={14} />
              {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
            </span>

            {showContact && (company?.catalog_contact_url || company?.whatsapp) && (
              <button type="button" className="pc-whatsapp-btn" onClick={() => openContact()}>
                <MessageCircle size={15} /> WhatsApp
              </button>
            )}
          </div>
        </div>
      </nav>

      <header className="pc-hero">
        <div className="pc-container pc-hero-inner">
          <span className="pc-hero-tag">Catalogo de produtos</span>
          <h1 className="pc-title">{company?.catalog_title || 'Catalogo de Produtos'}</h1>
          <p className="pc-subtitle">
            {company?.catalog_description || 'Explore os itens disponiveis, filtre por categoria e encontre o produto ideal para seu pedido.'}
          </p>

          <div className="pc-contact-row">
            {company?.phone && (
              <span className="pc-contact-item">
                <Phone size={15} /> {company.phone}
              </span>
            )}
            {company?.email && (
              <span className="pc-contact-item">
                <Mail size={15} /> {company.email}
              </span>
            )}
            {company?.address && (
              <span className="pc-contact-item">
                <MapPin size={15} /> {company.address}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="pc-toolbar-wrap">
        <div className="pc-container pc-toolbar">
          <div className="pc-tabs" role="tablist" aria-label="Categorias">
            <button
              type="button"
              className={`pc-tab ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => setSelectedCategory(null)}
              aria-selected={selectedCategory === null}
            >
              Todos ({products.length})
            </button>
            {categories.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`pc-tab ${selectedCategory === item.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(item.id)}
                aria-selected={selectedCategory === item.id}
              >
                {item.name} ({categoryCount.get(item.id) || 0})
              </button>
            ))}
          </div>

          <div className="pc-toolbar-actions">
            <div className="pc-sort-wrap">
              <ArrowUpDown size={14} />
              <select
                className="pc-sort-select"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortMode)}
                aria-label="Ordenacao"
              >
                <option value="name_asc">Nome A-Z</option>
                <option value="name_desc">Nome Z-A</option>
                <option value="price_asc">Menor preco</option>
                <option value="price_desc">Maior preco</option>
              </select>
            </div>

            <div className="pc-view-toggle" role="group" aria-label="Visualizacao">
              <button
                type="button"
                className={`pc-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Grade"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={`pc-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Lista"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="pc-main">
        <div className="pc-container">
          {filteredProducts.length === 0 ? (
            <section className="pc-empty" aria-live="polite">
              <div>
                <div className="pc-empty-icon">
                  <Package size={30} />
                </div>
                <h2 className="pc-empty-title">Nenhum produto encontrado</h2>
                <p className="pc-empty-subtitle">Tente outro filtro ou volte para Todos.</p>
                <button
                  type="button"
                  className="pc-empty-btn"
                  onClick={() => setSelectedCategory(null)}
                >
                  Ver todos os produtos
                </button>
              </div>
            </section>
          ) : (
            <section className={`pc-products ${viewMode === 'list' ? 'pc-list' : ''}`}>
              {filteredProducts.map((product) => {
                const productHref = `/catalogo/${slug}/produto/${product.slug?.trim() ? product.slug : product.id}`;
                const inPromotion = isPromotionActive(product as unknown as Product);
                const categoryName = product.category?.name || 'Produto';

                return (
                  <Link key={product.id} to={productHref} className="pc-product-card">
                    <div className="pc-image">
                      {inPromotion && (
                        <span className="pc-offer">
                          <Tag size={12} /> Oferta
                        </span>
                      )}
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" />
                      ) : (
                        <span className="pc-image-fallback">
                          <Package size={34} />
                        </span>
                      )}
                    </div>

                    <div className="pc-product-body">
                      <span className="pc-product-category">{categoryName}</span>
                      <h3 className="pc-product-title">{product.name}</h3>
                      <p className="pc-product-description">
                        {product.catalog_short_description || 'Produto personalizado com acabamento profissional.'}
                      </p>

                      <div className="pc-product-footer">
                        {showPrices ? (
                          <div className="pc-price-wrap">
                            {inPromotion && (
                              <span className="pc-price-base">De {asCurrency(getPromotionBasePrice(product))}</span>
                            )}
                            <span className="pc-price-main">
                              {inPromotion
                                ? `Por ${asCurrency(getProductPrice(product))}`
                                : asCurrency(getProductPrice(product))}
                            </span>
                          </div>
                        ) : (
                          <div className="pc-price-wrap">
                            <span className="pc-price-main">Preco sob consulta</span>
                          </div>
                        )}

                        <span className="pc-buy-pill">{buttonText}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}
        </div>
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
                  <Phone size={15} /> Ligar
                </a>
              )}

              {company?.email && (
                <a href={`mailto:${company.email}`} className="pc-footer-btn pc-footer-btn-outline">
                  <Mail size={15} /> E-mail
                </a>
              )}

              {showContact && (company?.catalog_contact_url || company?.whatsapp) ? (
                <button type="button" className="pc-footer-btn pc-footer-btn-primary" onClick={() => openContact()}>
                  <MessageCircle size={15} /> WhatsApp
                </button>
              ) : (
                <Link to={`/catalogo/${slug}`} className="pc-footer-btn pc-footer-btn-primary">
                  Ver Catalogo Completo
                </Link>
              )}
            </div>
          </div>

          <p className="pc-footer-copy">© {new Date().getFullYear()} {company?.name}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
