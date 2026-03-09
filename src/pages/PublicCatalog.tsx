import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Package,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { publicSupabase as supabase } from '@/integrations/supabase/public-client';
import { Slider } from '@/components/ui/slider';
import { BannerCarousel } from '@/components/BannerCarousel';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { PUBLIC_CART_UPDATED_EVENT, getPublicCartItemsCount } from '@/lib/public-cart';
import { getRecentlyViewedProducts, pushRecentlyViewedProduct } from '@/lib/catalogAnalytics';
import { loadPublicCatalogCompany } from '@/lib/publicCatalogCompany';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { normalizeProductionTimeDays } from '@/lib/productionTime';
import { isPromotionActive, resolveProductBasePrice, resolveProductPrice } from '@/lib/pricing';
import { getProductSaleUnitPriceSuffix } from '@/lib/productSaleUnit';
import { CategoryIcon } from '@/lib/categoryIcons';
import { buildCategoryProductCountMap, buildCategoryTree, collectCategoryScopeIds } from '@/lib/categoryTree';
import { buildCatalogProductMetrics, getProductBadgeLabels, normalizeCatalogText, scoreCatalogSearchMatch } from '@/lib/catalogDiscovery';
import { Category, Company as DatabaseCompany, Product, ProductReview } from '@/types/database';

interface Company extends Omit<DatabaseCompany, 'catalog_contact_url' | 'whatsapp'> {
  catalog_layout?: 'grid' | 'list' | null;
  catalog_title?: string | null;
  catalog_description?: string | null;
  catalog_share_image_url?: string | null;
  catalog_button_text?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_primary_color?: string | null;
  catalog_secondary_color?: string | null;
  catalog_text_color?: string | null;
  catalog_contact_url?: string;
  whatsapp?: string;
}

interface ProductWithCategory extends Omit<Product, 'category'> {
  category?: { id?: string; name?: string } | null;
}

type ProductAttributeRow = {
  product_id: string;
  attribute_value?: {
    id?: string;
    value?: string;
    attribute?: {
      id?: string;
      name?: string;
    } | null;
  } | null;
};

type SortMode =
  | 'top_ranked'
  | 'sales_desc'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc';

type ViewMode = 'grid' | 'list';
type DiscoverySectionId = 'best_sellers' | 'top_ranked' | 'recommended' | 'recently_viewed';

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const getProductPrice = (product: ProductWithCategory) =>
  resolveProductPrice(product as unknown as Product, 1, [], 0);

const getPromotionBasePrice = (product: ProductWithCategory) =>
  resolveProductBasePrice(product as unknown as Product, 1, [], 0);

const cardShadow = '0 16px 38px rgba(15, 23, 42, 0.08)';

function CategoryMenuNode({
  node,
  selectedCategory,
  expandedCategoryIds,
  productCountMap,
  onSelect,
  onToggle,
}: {
  node: ReturnType<typeof buildCategoryTree>[number];
  selectedCategory: string | null;
  expandedCategoryIds: string[];
  productCountMap: Map<string, number>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expandedCategoryIds.includes(node.id);
  const isSelected = selectedCategory === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] text-[var(--pc-muted)] transition hover:bg-[var(--pc-filter-bg)]/10 hover:text-[var(--pc-text)]"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--pc-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
          </span>
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={[
            'flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
            isSelected
              ? 'border-[var(--pc-filter-bg)] bg-[var(--pc-filter-bg)] text-[var(--pc-filter-text)] shadow-sm'
              : 'border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-filter-bg)]/6',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-current/10 bg-current/5">
              <CategoryIcon
                iconName={node.icon_name}
                iconUrl={node.icon_url}
                className="h-4 w-4"
                imageClassName="h-4 w-4 rounded-sm"
                title={node.name}
              />
            </span>
            <span className="truncate text-sm font-medium">{node.name}</span>
          </span>
          <span className="rounded-full border border-current/10 px-2 py-0.5 text-xs font-semibold">
            {productCountMap.get(node.id) || 0}
          </span>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className="ml-5 space-y-2 border-l border-[var(--pc-card-border)] pl-4">
          {node.children.map((child) => (
            <CategoryMenuNode
              key={child.id}
              node={child}
              selectedCategory={selectedCategory}
              expandedCategoryIds={expandedCategoryIds}
              productCountMap={productCountMap}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductMiniShelf({
  title,
  icon,
  products,
  company,
  metricsMap,
}: {
  title: string;
  icon: React.ReactNode;
  products: ProductWithCategory[];
  company: Company | null;
  metricsMap: Map<string, { reviewCount: number; averageRating: number; rankingScore: number }>;
}) {
  if (products.length === 0) return null;

  return (
    <section
      className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
      style={{ boxShadow: cardShadow }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--pc-filter-bg)]/10 text-[var(--pc-filter-bg)]">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--pc-text)]">{title}</h2>
          <p className="text-sm text-[var(--pc-muted)]">Destaques atualizados automaticamente com base no catálogo.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => {
          const productIdentifier = product.slug?.trim() ? product.slug : product.id;
          const href = company?.slug
            ? `/catalogo/${company.slug}/produto/${productIdentifier}`
            : `/catalogo/produto/${product.id}`;
          const metrics = metricsMap.get(product.id);

          return (
            <Link
              key={product.id}
              to={href}
              className="group rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--pc-filter-bg)]/35"
              onClick={() => {
                if (company?.id) pushRecentlyViewedProduct(company.id, product.id);
              }}
            >
              <div className="mb-3 overflow-hidden rounded-xl border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)]">
                <div className="flex h-[130px] sm:h-[180px] items-center justify-center bg-[var(--pc-page-bg)]">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-contain p-2 sm:p-4 transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <Package className="h-8 w-8 sm:h-10 sm:w-10 text-[var(--pc-muted)]" />
                  )}
                </div>
              </div>
              <p className="line-clamp-1 text-[10px] sm:text-sm text-[var(--pc-muted)]">{product.category?.name || 'Produto'}</p>
              <h3 className="mt-1 line-clamp-2 text-xs sm:text-base font-semibold text-[var(--pc-text)]">{product.name}</h3>
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--pc-muted)]">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                <span>{metrics?.averageRating ? metrics.averageRating.toFixed(1) : 'Sem nota'}</span>
                <span>•</span>
                <span>{Number(product.sales_count || 0)} vendas</span>
              </div>
              <div className="mt-2.5">
                <p className="text-xs sm:text-sm font-bold text-[var(--pc-price)]">{asCurrency(getProductPrice(product))}</p>
                <p className="text-[10px] sm:text-[11px] text-[var(--pc-muted)]">{getProductSaleUnitPriceSuffix(product.unit_type)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DiscoverySidebar({
  sections,
  activeSection,
  onChange,
  company,
  metricsMap,
}: {
  sections: Array<{
    id: DiscoverySectionId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    products: ProductWithCategory[];
  }>;
  activeSection: DiscoverySectionId;
  onChange: (id: DiscoverySectionId) => void;
  company: Company | null;
  metricsMap: Map<string, { reviewCount: number; averageRating: number; rankingScore: number }>;
}) {
  const active = sections.find((section) => section.id === activeSection) || sections[0];

  if (!active) return null;

  return (
    <aside className="space-y-4 xl:sticky xl:top-[92px]">
      <section
        className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
        style={{ boxShadow: cardShadow }}
      >
        <div className="mb-4">
          <h2 className="text-base font-bold text-[var(--pc-text)]">Descubra no catálogo</h2>
          <p className="mt-1 text-sm text-[var(--pc-muted)]">Acesse rapidamente os destaques e navegue melhor pelos produtos.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {sections.map((section) => {
            const isActive = activeSection === section.id;
            const isEmpty = section.products.length === 0;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onChange(section.id)}
                className={[
                  'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition',
                  isActive
                    ? 'border-[var(--pc-filter-bg)] bg-[var(--pc-filter-bg)] text-[var(--pc-filter-text)] shadow-sm'
                    : 'border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-filter-bg)]/6',
                  isEmpty ? 'opacity-70' : '',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-current/10 bg-current/8">
                    {section.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{section.title}</span>
                    <span className="block truncate text-xs opacity-80">
                      {section.subtitle}
                    </span>
                  </span>
                </span>
                <span className="rounded-full border border-current/10 px-2 py-0.5 text-xs font-semibold">
                  {section.products.length}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
        style={{ boxShadow: cardShadow }}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--pc-filter-bg)]/10 text-[var(--pc-filter-bg)]">
            {active.icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--pc-text)]">{active.title}</h3>
            <p className="text-sm text-[var(--pc-muted)]">{active.subtitle}</p>
          </div>
        </div>

        {active.products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-4 py-8 text-center">
            <p className="text-sm font-medium text-[var(--pc-text)]">Nenhum produto disponível nesta seção.</p>
            <p className="mt-1 text-sm text-[var(--pc-muted)]">O menu continua disponível e será preenchido automaticamente quando houver dados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.products.map((product) => {
              const productIdentifier = product.slug?.trim() ? product.slug : product.id;
              const href = company?.slug
                ? `/catalogo/${company.slug}/produto/${productIdentifier}`
                : `/catalogo/produto/${product.id}`;
              const metrics = metricsMap.get(product.id);

              return (
                <Link
                  key={product.id}
                  to={href}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] p-3 transition hover:border-[var(--pc-filter-bg)]/35 hover:bg-[var(--pc-filter-bg)]/5"
                  onClick={() => {
                    if (company?.id) pushRecentlyViewedProduct(company.id, product.id);
                  }}
                >
                  <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)]">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-contain p-2" />
                    ) : (
                      <Package className="h-6 w-6 text-[var(--pc-muted)]" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[var(--pc-muted)]">
                      {product.category?.name || 'Produto'}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-sm font-semibold text-[var(--pc-text)]">
                      {product.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--pc-muted)]">
                      {(metrics?.averageRating || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-amber-500" />
                          {metrics?.averageRating?.toFixed(1)}
                        </span>
                      ) : null}
                      <span>{Number(product.sales_count || 0)} vendas</span>
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold text-[var(--pc-price)]">
                      {asCurrency(getProductPrice(product))}
                    </span>
                    <span className="block text-[11px] text-[var(--pc-muted)]">
                      {getProductSaleUnitPriceSuffix(product.unit_type)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}

function ProductListCard({
  product,
  company,
  showPrices,
  buttonText,
  reviewHref,
  metricsMap,
}: {
  product: ProductWithCategory;
  company: Company | null;
  showPrices: boolean;
  buttonText: string;
  reviewHref: string;
  metricsMap: Map<string, { reviewCount: number; averageRating: number; rankingScore: number }>;
}) {
  const productIdentifier = product.slug?.trim() ? product.slug : product.id;
  const href = company?.slug
    ? `/catalogo/${company.slug}/produto/${productIdentifier}`
    : `/catalogo/produto/${product.id}`;
  const inPromotion = isPromotionActive(product as Product);
  const productionTimeDays = normalizeProductionTimeDays(product.production_time_days);
  const metrics = metricsMap.get(product.id);
  const badges = getProductBadgeLabels(product as Product, metrics);
  const handleProductOpen = () => {
    if (company?.id) pushRecentlyViewedProduct(company.id, product.id);
  };

  return (
    <div
      className="group overflow-hidden rounded-[24px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] transition hover:-translate-y-0.5 hover:border-[var(--pc-filter-bg)]/35"
      style={{ boxShadow: cardShadow }}
    >
      <Link
        to={href}
        className="flex flex-col md:grid md:grid-cols-[240px_1fr] md:min-h-[216px]"
        onClick={handleProductOpen}
      >
        <div className="relative overflow-hidden border-b border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] md:border-b-0 md:border-r">
          <div className="flex h-[180px] md:h-full md:min-h-[216px] items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <Package className="h-10 w-10 md:h-12 md:w-12 text-[var(--pc-muted)]" />
            )}
          </div>

          {badges.length > 0 ? (
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor:
                      badge === 'Promocao'
                        ? 'var(--pc-badge-bg)'
                        : badge === 'Mais vendido'
                          ? 'color-mix(in srgb, var(--pc-filter-bg) 18%, white)'
                          : 'color-mix(in srgb, var(--pc-button-bg) 14%, white)',
                    color: badge === 'Promocao' ? 'var(--pc-badge-text)' : 'var(--pc-text)',
                  }}
                >
                  {badge === 'Promocao' ? 'Promoção' : badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--pc-muted)]">{product.category?.name || 'Produto'}</span>
            {product.personalization_enabled ? (
              <span className="rounded-full border border-[var(--pc-badge-bg)]/30 bg-[var(--pc-badge-bg)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--pc-badge-text)]">
                Personalizado
              </span>
            ) : null}
            {(metrics?.averageRating || 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pc-muted)]">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                {metrics?.averageRating?.toFixed(1)}
              </span>
            ) : null}
          </div>

          <div>
            <h3 className="text-[1.02rem] font-bold leading-tight text-[var(--pc-text)]">{product.name}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--pc-muted)]">
              {product.catalog_short_description || product.description || 'Produto disponível no catálogo.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-[var(--pc-muted)]">
            {Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1)) > 1 ? (
              <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
                Pedido mínimo: {Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1))}
              </span>
            ) : null}
            {productionTimeDays !== null ? (
              <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
                Produção: {productionTimeDays} {productionTimeDays === 1 ? 'dia' : 'dias'}
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
              {Number(product.sales_count || 0)} vendas
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {showPrices ? (
              <div>
                {inPromotion ? (
                  <p className="text-sm text-[var(--pc-muted)] line-through">
                    {asCurrency(getPromotionBasePrice(product))}
                  </p>
                ) : null}
                <p className="text-xl font-extrabold text-[var(--pc-price)]">
                  {asCurrency(getProductPrice(product))}
                </p>
                <p className="text-xs font-medium text-[var(--pc-muted)]">
                  {getProductSaleUnitPriceSuffix(product.unit_type)}
                </p>
              </div>
            ) : (
              <p className="text-base font-semibold text-[var(--pc-price)]">Preço sob consulta</p>
            )}

            <span
              className="inline-flex min-h-[42px] items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--pc-button-bg)',
                color: 'var(--pc-button-text)',
              }}
            >
              {buttonText}
            </span>
          </div>
        </div>
      </Link>

      <div className="border-t border-[var(--pc-card-border)] px-5 py-4">
        <Link
          to={reviewHref}
          className="inline-flex min-h-[42px] w-full items-center justify-center rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] px-4 py-2 text-sm font-semibold text-[var(--pc-text)] transition hover:border-[var(--pc-filter-bg)] hover:text-[var(--pc-filter-bg)]"
          onClick={handleProductOpen}
        >
          Avaliar produto
        </Link>
      </div>
    </div>
  );
}

function ProductGridCard({
  product,
  company,
  showPrices,
  buttonText,
  reviewHref,
  metricsMap,
}: {
  product: ProductWithCategory;
  company: Company | null;
  showPrices: boolean;
  buttonText: string;
  reviewHref: string;
  metricsMap: Map<string, { reviewCount: number; averageRating: number; rankingScore: number }>;
}) {
  const productIdentifier = product.slug?.trim() ? product.slug : product.id;
  const href = company?.slug
    ? `/catalogo/${company.slug}/produto/${productIdentifier}`
    : `/catalogo/produto/${product.id}`;
  const inPromotion = isPromotionActive(product as Product);
  const productionTimeDays = normalizeProductionTimeDays(product.production_time_days);
  const metrics = metricsMap.get(product.id);
  const badges = getProductBadgeLabels(product as Product, metrics);

  const handleProductOpen = () => {
    if (company?.id) pushRecentlyViewedProduct(company.id, product.id);
  };

  return (
    <div
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] transition hover:-translate-y-0.5 hover:border-[var(--pc-filter-bg)]/35"
      style={{ boxShadow: cardShadow }}
    >
      <Link to={href} className="flex flex-1 flex-col" onClick={handleProductOpen}>
        <div className="relative overflow-hidden border-b border-[var(--pc-card-border)] bg-[var(--pc-page-bg)]">
          <div className="flex h-[140px] sm:h-[208px] items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-contain p-2 sm:p-4 transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <Package className="h-8 w-8 sm:h-12 sm:w-12 text-[var(--pc-muted)]" />
            )}
          </div>

          {badges.length > 0 ? (
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor:
                      badge === 'Promocao'
                        ? 'var(--pc-badge-bg)'
                        : badge === 'Mais vendido'
                          ? 'color-mix(in srgb, var(--pc-filter-bg) 18%, white)'
                          : 'color-mix(in srgb, var(--pc-button-bg) 14%, white)',
                    color: badge === 'Promocao' ? 'var(--pc-badge-text)' : 'var(--pc-text)',
                  }}
                >
                  {badge === 'Promocao' ? 'Promoção' : badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="truncate text-[10px] sm:text-sm text-[var(--pc-muted)]">{product.category?.name || 'Produto'}</span>
            {product.personalization_enabled ? (
              <span className="rounded-full border border-[var(--pc-badge-bg)]/30 bg-[var(--pc-badge-bg)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--pc-badge-text)]">
                Personalizado
              </span>
            ) : null}
            {(metrics?.averageRating || 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pc-muted)]">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                {metrics?.averageRating?.toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="space-y-1 sm:space-y-2">
            <h3 className="line-clamp-2 text-sm sm:text-[1.02rem] font-bold leading-tight text-[var(--pc-text)]">{product.name}</h3>
            <p className="hidden sm:line-clamp-2 text-sm leading-6 text-[var(--pc-muted)]">
              {product.catalog_short_description || product.description || 'Produto disponível no catálogo.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-[var(--pc-muted)]">
            {Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1)) > 1 ? (
              <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
                Pedido mínimo: {Math.max(1, Number(product.catalog_min_order ?? product.min_order_quantity ?? 1))}
              </span>
            ) : null}
            {productionTimeDays !== null ? (
              <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
                Produção: {productionTimeDays} {productionTimeDays === 1 ? 'dia' : 'dias'}
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--pc-card-border)] px-2.5 py-1">
              {Number(product.sales_count || 0)} vendas
            </span>
          </div>
        </div>
      </Link>

      <div className="mt-auto flex flex-col gap-2 sm:gap-3 px-3 sm:px-4 pb-3 sm:px-4">
        <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
          {showPrices ? (
            <div className="min-w-0 flex-1">
              {inPromotion ? (
                <p className="truncate text-[10px] sm:text-sm text-[var(--pc-muted)] line-through">
                  {asCurrency(getPromotionBasePrice(product))}
                </p>
              ) : null}
              <p className="truncate text-base sm:text-xl font-extrabold text-[var(--pc-price)]">
                {asCurrency(getProductPrice(product))}
              </p>
            </div>
          ) : (
            <p className="text-[11px] sm:text-base font-semibold text-[var(--pc-price)]">Preço sob consulta</p>
          )}

          <Link
            to={href}
            onClick={handleProductOpen}
            className="inline-flex min-h-[36px] sm:min-h-[42px] items-center justify-center rounded-xl sm:rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold"
            style={{
              backgroundColor: 'var(--pc-button-bg)',
              color: 'var(--pc-button-text)',
            }}
          >
            {buttonText}
          </Link>
        </div>

        <Link
          to={reviewHref}
          className="inline-flex min-h-[36px] sm:min-h-[42px] w-full items-center justify-center rounded-xl sm:rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-[var(--pc-text)] transition hover:border-[var(--pc-filter-bg)] hover:text-[var(--pc-filter-bg)]"
          onClick={handleProductOpen}
        >
          Avaliar
        </Link>
      </div>
    </div>
  );
}

export default function PublicCatalog() {
  const { slug, companyId } = useParams<{ slug?: string; companyId?: string }>();
  const navigate = useNavigate();
  const { user } = useCustomerAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [attributeRows, setAttributeRows] = useState<ProductAttributeRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortMode>('top_ranked');
  const [cartItemsCount, setCartItemsCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttributeValues, setSelectedAttributeValues] = useState<Record<string, string[]>>({});
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [activeDiscoverySection, setActiveDiscoverySection] = useState<DiscoverySectionId>('best_sellers');

  useEffect(() => {
    const loadCatalog = async () => {
      const resolvedSlug = slug?.trim();
      const resolvedCompanyId = companyId?.trim();

      if (!resolvedSlug && !resolvedCompanyId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);

      const companyData = await loadPublicCatalogCompany({
        slug: resolvedSlug,
        companyId: resolvedCompanyId,
      });

      if (!companyData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCompany(companyData as Company);
      setViewMode(companyData.catalog_layout === 'list' ? 'list' : 'grid');

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*, category:categories(id, name)')
        .eq('company_id', companyData.id)
        .or('catalog_enabled.is.true,show_in_catalog.is.true')
        .eq('is_active', true)
        .order('catalog_sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (productsError) {
        console.error(productsError);
        setNotFound(true);
        setLoading(false);
        return;
      }

      const mappedProducts = ((productsData || []) as unknown as ProductWithCategory[]).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
      }));

      const productIds = mappedProducts.map((product) => product.id);

      const [categoriesResult, reviewsResult, attributesResult] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('company_id', companyData.id)
          .order('order_position', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('product_reviews')
          .select('*')
          .eq('company_id', companyData.id)
          .eq('is_approved', true),
        productIds.length > 0
          ? supabase
            .from('product_attributes')
            .select('product_id, attribute_value:attribute_values(id, value, attribute:attributes(id, name))')
            .in('product_id', productIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      setProducts(mappedProducts);
      setCategories(((categoriesResult.data || []) as Category[]).sort((a, b) => {
        const orderDiff = Number(a.order_position ?? 0) - Number(b.order_position ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return a.name.localeCompare(b.name, 'pt-BR');
      }));
      setReviews((reviewsResult.data || []) as ProductReview[]);
      setAttributeRows((attributesResult.data || []) as ProductAttributeRow[]);
      setExpandedCategoryIds(
        ((categoriesResult.data || []) as Category[])
          .filter((category) => !category.parent_id)
          .map((category) => category.id),
      );
      setRecentlyViewedIds(getRecentlyViewedProducts(companyData.id));
      setLoading(false);
    };

    void loadCatalog();
  }, [companyId, slug]);

  useEffect(() => {
    if (!company) return;

    const title = company.catalog_title || company.name || 'Catálogo';
    const description = company.catalog_description || `Catálogo de ${company.name}`;

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

  useEffect(() => {
    if (!company?.id) {
      setCartItemsCount(0);
      return;
    }

    const refreshCartCount = () => {
      setCartItemsCount(getPublicCartItemsCount(company.id));
      setRecentlyViewedIds(getRecentlyViewedProducts(company.id));
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

  const productMetricsMap = useMemo(
    () => buildCatalogProductMetrics(products as Product[], reviews),
    [products, reviews],
  );

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const categoryCountMap = useMemo(
    () => buildCategoryProductCountMap(categories, products as Product[]),
    [categories, products],
  );

  const categoryNameMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const productAttributeMap = useMemo(() => {
    const map = new Map<
      string,
      {
        terms: string[];
        valuesByAttribute: Record<string, string[]>;
      }
    >();

    attributeRows.forEach((row) => {
      const attributeId = row.attribute_value?.attribute?.id;
      const attributeName = row.attribute_value?.attribute?.name;
      const valueId = row.attribute_value?.id;
      const valueLabel = row.attribute_value?.value;
      if (!attributeId || !attributeName || !valueId || !valueLabel) return;

      const entry = map.get(row.product_id) ?? {
        terms: [],
        valuesByAttribute: {},
      };

      entry.terms.push(attributeName, valueLabel);
      entry.valuesByAttribute[attributeId] = [...(entry.valuesByAttribute[attributeId] || []), valueId];
      map.set(row.product_id, entry);
    });

    return map;
  }, [attributeRows]);

  const attributeFacets = useMemo(() => {
    const facets = new Map<
      string,
      {
        id: string;
        name: string;
        values: Map<string, { id: string; label: string; count: number }>;
      }
    >();

    attributeRows.forEach((row) => {
      const attributeId = row.attribute_value?.attribute?.id;
      const attributeName = row.attribute_value?.attribute?.name;
      const valueId = row.attribute_value?.id;
      const valueLabel = row.attribute_value?.value;
      if (!attributeId || !attributeName || !valueId || !valueLabel) return;

      const facet = facets.get(attributeId) ?? {
        id: attributeId,
        name: attributeName,
        values: new Map(),
      };

      const currentValue = facet.values.get(valueId) ?? { id: valueId, label: valueLabel, count: 0 };
      currentValue.count += 1;
      facet.values.set(valueId, currentValue);
      facets.set(attributeId, facet);
    });

    return [...facets.values()].map((facet) => ({
      id: facet.id,
      name: facet.name,
      values: [...facet.values.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    }));
  }, [attributeRows]);

  const searchSuggestions = useMemo(() => {
    const normalizedTerm = normalizeCatalogText(searchTerm);
    if (!normalizedTerm || normalizedTerm.length < 2) {
      return {
        categories: [] as Category[],
        products: [] as ProductWithCategory[],
      };
    }

    const suggestedCategories = categories
      .filter((category) => normalizeCatalogText(category.name).includes(normalizedTerm))
      .slice(0, 4);

    const suggestedProducts = [...products]
      .map((product) => ({
        product,
        score: scoreCatalogSearchMatch({
          product: product as Product,
          categoryName: categoryNameMap.get(product.category_id || '') || product.category?.name || '',
          attributeTerms: productAttributeMap.get(product.id)?.terms || [],
          term: normalizedTerm,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((entry) => entry.product);

    return {
      categories: suggestedCategories,
      products: suggestedProducts,
    };
  }, [categories, categoryNameMap, productAttributeMap, products, searchTerm]);

  const priceBounds = useMemo(() => {
    const prices = products.map((product) => getProductPrice(product)).filter((value) => Number.isFinite(value));
    if (prices.length === 0) return { min: 0, max: 0 };
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    };
  }, [products]);

  useEffect(() => {
    setPriceRange([priceBounds.min, priceBounds.max]);
  }, [priceBounds.max, priceBounds.min]);

  const filteredProducts = useMemo(() => {
    const scopeIds = collectCategoryScopeIds(categories, selectedCategory);
    const normalizedSearch = normalizeCatalogText(searchTerm);

    const nextProducts = products
      .map((product) => {
        const score = normalizedSearch
          ? scoreCatalogSearchMatch({
            product: product as Product,
            categoryName: categoryNameMap.get(product.category_id || '') || product.category?.name || '',
            attributeTerms: productAttributeMap.get(product.id)?.terms || [],
            term: normalizedSearch,
          })
          : 1;

        return { product, score };
      })
      .filter(({ product, score }) => {
        if (scopeIds && !scopeIds.has(product.category_id || '')) return false;

        const price = getProductPrice(product);
        if (price < priceRange[0] || price > priceRange[1]) return false;

        if (normalizedSearch && score <= 0) return false;

        const attributeState = productAttributeMap.get(product.id)?.valuesByAttribute || {};
        const attrMismatch = Object.entries(selectedAttributeValues).some(([attributeId, selectedValues]) => {
          if (!selectedValues.length) return false;
          const productValues = attributeState[attributeId] || [];
          return !selectedValues.some((valueId) => productValues.includes(valueId));
        });

        return !attrMismatch;
      });

    const sorted = [...nextProducts].sort((a, b) => {
      if (sortBy === 'top_ranked') {
        return (productMetricsMap.get(b.product.id)?.rankingScore || 0) - (productMetricsMap.get(a.product.id)?.rankingScore || 0);
      }
      if (sortBy === 'sales_desc') return Number(b.product.sales_count || 0) - Number(a.product.sales_count || 0);
      if (sortBy === 'name_asc') return a.product.name.localeCompare(b.product.name, 'pt-BR');
      if (sortBy === 'name_desc') return b.product.name.localeCompare(a.product.name, 'pt-BR');
      if (sortBy === 'price_asc') return getProductPrice(a.product) - getProductPrice(b.product);
      if (sortBy === 'price_desc') return getProductPrice(b.product) - getProductPrice(a.product);
      return b.score - a.score;
    });

    return sorted.map((entry) => entry.product);
  }, [
    categories,
    categoryNameMap,
    priceRange,
    productAttributeMap,
    productMetricsMap,
    products,
    searchTerm,
    selectedAttributeValues,
    selectedCategory,
    sortBy,
  ]);

  const bestSellingProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => Number(b.sales_count || 0) - Number(a.sales_count || 0))
        .filter((product) => Number(product.sales_count || 0) > 0)
        .slice(0, 4),
    [products],
  );

  const topRankedProducts = useMemo(
    () =>
      [...products]
        .sort(
          (a, b) =>
            (productMetricsMap.get(b.id)?.rankingScore || 0) - (productMetricsMap.get(a.id)?.rankingScore || 0),
        )
        .slice(0, 4),
    [productMetricsMap, products],
  );

  const recentlyViewedProducts = useMemo(
    () =>
      recentlyViewedIds
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is ProductWithCategory => Boolean(product))
        .slice(0, 4),
    [products, recentlyViewedIds],
  );

  const recommendedProducts = useMemo(() => {
    const recentCategories = new Set(recentlyViewedProducts.map((product) => product.category_id).filter(Boolean));
    const source = recentCategories.size > 0
      ? products.filter((product) => recentCategories.has(product.category_id))
      : products;

    return [...source]
      .sort((a, b) => {
        const scoreA =
          (productMetricsMap.get(a.id)?.rankingScore || 0) +
          (a.catalog_featured ? 30 : 0);
        const scoreB =
          (productMetricsMap.get(b.id)?.rankingScore || 0) +
          (b.catalog_featured ? 30 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 4);
  }, [productMetricsMap, products, recentlyViewedProducts]);

  const discoverySections = useMemo(
    () => [
      {
        id: 'best_sellers' as const,
        title: 'Produtos mais vendidos',
        subtitle: 'Itens com maior saída recente no catálogo.',
        icon: <TrendingUp className="h-5 w-5" />,
        products: bestSellingProducts,
      },
      {
        id: 'top_ranked' as const,
        title: 'Top produtos',
        subtitle: 'Mais fortes em vendas, visualizações e avaliações.',
        icon: <Sparkles className="h-5 w-5" />,
        products: topRankedProducts,
      },
      {
        id: 'recommended' as const,
        title: 'Recomendados para você',
        subtitle: 'Sugestões alinhadas ao interesse do cliente.',
        icon: <ShoppingCart className="h-5 w-5" />,
        products: recommendedProducts,
      },
      {
        id: 'recently_viewed' as const,
        title: 'Você viu recentemente',
        subtitle: 'Atalhos para retomar produtos visualizados.',
        icon: <Tag className="h-5 w-5" />,
        products: recentlyViewedProducts,
      },
    ],
    [bestSellingProducts, recommendedProducts, recentlyViewedProducts, topRankedProducts],
  );

  useEffect(() => {
    const nextActiveSection =
      discoverySections.find((section) => section.id === activeDiscoverySection && section.products.length > 0)?.id ||
      discoverySections.find((section) => section.products.length > 0)?.id ||
      discoverySections[0]?.id;

    if (nextActiveSection && nextActiveSection !== activeDiscoverySection) {
      setActiveDiscoverySection(nextActiveSection);
    }
  }, [activeDiscoverySection, discoverySections]);

  const showPrices = company?.catalog_show_prices ?? true;
  const showContact = company?.catalog_show_contact ?? true;
  const buttonText = company?.catalog_button_text || 'Fazer Pedido';
  const catalogThemeStyle = {
    ['--pc-page-bg' as const]: `color-mix(in srgb, ${company?.catalog_header_bg_color || company?.catalog_secondary_color || '#0f172a'} 8%, #f8fafc)`,
    ['--pc-muted' as const]: `color-mix(in srgb, ${company?.catalog_text_color || '#0f172a'} 56%, #94a3b8)`,
    ['--pc-blue' as const]: company?.catalog_primary_color || company?.catalog_button_bg_color || '#2563eb',
    ['--pc-accent' as const]: company?.catalog_accent_color || company?.catalog_badge_bg_color || '#f59e0b',
    ['--pc-navy' as const]: company?.catalog_secondary_color || company?.catalog_header_bg_color || '#0f172a',
    ['--pc-text' as const]: company?.catalog_text_color || '#0f172a',
    ['--pc-header-bg' as const]: company?.catalog_header_bg_color || company?.catalog_secondary_color || '#0f172a',
    ['--pc-header-text' as const]: company?.catalog_header_text_color || '#ffffff',
    ['--pc-footer-bg' as const]: company?.catalog_footer_bg_color || company?.catalog_secondary_color || '#020617',
    ['--pc-footer-text' as const]: company?.catalog_footer_text_color || '#ffffff',
    ['--pc-button-bg' as const]: company?.catalog_button_bg_color || company?.catalog_primary_color || '#2563eb',
    ['--pc-button-text' as const]: company?.catalog_button_text_color || '#ffffff',
    ['--pc-button-outline' as const]:
      company?.catalog_button_outline_color || company?.catalog_button_bg_color || company?.catalog_primary_color || '#2563eb',
    ['--pc-badge-bg' as const]: company?.catalog_badge_bg_color || company?.catalog_accent_color || '#f59e0b',
    ['--pc-badge-text' as const]: company?.catalog_badge_text_color || '#2f2406',
    ['--pc-card-bg' as const]: company?.catalog_card_bg_color || '#ffffff',
    ['--pc-card-border' as const]: company?.catalog_card_border_color || '#dbe4f0',
    ['--pc-filter-bg' as const]: company?.catalog_filter_bg_color || company?.catalog_primary_color || '#2563eb',
    ['--pc-filter-text' as const]: company?.catalog_filter_text_color || '#ffffff',
    ['--pc-price' as const]: company?.catalog_price_color || company?.catalog_accent_color || company?.catalog_primary_color || '#ea580c',
  } as React.CSSProperties;

  const catalogPath = company
    ? company.slug
      ? `/catalogo/${company.slug}`
      : `/loja/${company.id}`
    : '/catalogo';

  const customerOrdersPath = useMemo(() => {
    if (!company?.id) return '/minha-conta/pedidos';
    const params = new URLSearchParams();
    params.set('catalog', catalogPath);
    params.set('company', company.id);
    return `/minha-conta/pedidos?${params.toString()}`;
  }, [catalogPath, company?.id]);

  const customerLoginPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('next', customerOrdersPath);
    if (company?.slug) params.set('catalog', catalogPath);
    if (company?.id) params.set('company', company.id);
    return `/minha-conta/login?${params.toString()}`;
  }, [catalogPath, company?.id, company?.slug, customerOrdersPath]);

  const heroMetaItems = useMemo(() => {
    const items: Array<{ icon: 'phone' | 'mail' | 'pin'; label: string }> = [];
    if (company?.phone) items.push({ icon: 'phone', label: company.phone });
    if (company?.email) items.push({ icon: 'mail', label: company.email });
    if (company?.address) items.push({ icon: 'pin', label: company.address });
    return items;
  }, [company?.address, company?.email, company?.phone]);

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setSelectedAttributeValues({});
    setSearchTerm('');
    setPriceRange([priceBounds.min, priceBounds.max]);
  };

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    );
  };

  const toggleAttributeValue = (attributeId: string, valueId: string) => {
    setSelectedAttributeValues((prev) => {
      const current = prev[attributeId] || [];
      const nextValues = current.includes(valueId)
        ? current.filter((value) => value !== valueId)
        : [...current, valueId];

      return {
        ...prev,
        [attributeId]: nextValues,
      };
    });
  };

  const hasActiveFilters =
    Boolean(selectedCategory) ||
    Boolean(searchTerm.trim()) ||
    Object.values(selectedAttributeValues).some((values) => values.length > 0) ||
    priceRange[0] !== priceBounds.min ||
    priceRange[1] !== priceBounds.max;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="grid min-h-screen place-items-center">
          <p className="text-sm font-medium text-slate-500">Carregando catálogo...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="grid min-h-screen place-items-center px-4">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Catálogo não encontrado</h1>
            <p className="mt-2 text-slate-500">Este catálogo não existe ou não está disponível.</p>
            <button
              type="button"
              className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              onClick={() => navigate('/catalogo')}
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--pc-page-bg)] text-[var(--pc-text)]" style={catalogThemeStyle}>
      <CatalogTopNav
        company={company}
        cartCount={cartItemsCount}
        onCartClick={() => {
          if (!company?.id) return;
          navigate(company.slug ? `/catalogo/${company.slug}/carrinho` : `/catalogo/carrinho/${company.id}`);
        }}
        showAccount
        accountHref={user ? customerOrdersPath : customerLoginPath}
        accountLabel={user ? 'Minha conta' : 'Entrar / Criar'}
        showContact={showContact}
      />

      <CatalogHero
        company={company}
        badge="Catálogo de produtos"
        title={company?.catalog_title || 'Catálogo'}
        description={
          company?.catalog_description ||
          'Explore os itens disponíveis, filtre por categoria e encontre o produto ideal para seu pedido.'
        }
        metaItems={heroMetaItems}
      />

      {company?.id ? (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
          <BannerCarousel companyId={company.id} position="catalog" />
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div
          className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-4"
          style={{ boxShadow: cardShadow }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <div className="flex min-h-[52px] items-center rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-4">
                <Search className="h-4 w-4 text-[var(--pc-muted)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nome, SKU, categoria, descrição ou atributo"
                  className="h-12 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-[var(--pc-muted)]"
                />
              </div>

              {(searchSuggestions.categories.length > 0 || searchSuggestions.products.length > 0) && searchTerm.trim() ? (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-2"
                  style={{ boxShadow: cardShadow }}
                >
                  {searchSuggestions.categories.length > 0 ? (
                    <div className="border-b border-[var(--pc-card-border)] px-2 pb-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pc-muted)]">
                        Categorias
                      </p>
                      <div className="space-y-1">
                        {searchSuggestions.categories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(category.id);
                              setSearchTerm('');
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[var(--pc-page-bg)]"
                          >
                            <CategoryIcon
                              iconName={category.icon_name}
                              iconUrl={category.icon_url}
                              className="h-4 w-4 text-[var(--pc-filter-bg)]"
                              imageClassName="h-4 w-4 rounded-sm"
                            />
                            <span>{category.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {searchSuggestions.products.length > 0 ? (
                    <div className="px-2 pt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pc-muted)]">
                        Produtos
                      </p>
                      <div className="space-y-1">
                        {searchSuggestions.products.map((product) => {
                          const productIdentifier = product.slug?.trim() ? product.slug : product.id;
                          const href = company?.slug
                            ? `/catalogo/${company.slug}/produto/${productIdentifier}`
                            : `/catalogo/produto/${product.id}`;

                          return (
                            <Link
                              key={product.id}
                              to={href}
                              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-[var(--pc-page-bg)]"
                              onClick={() => {
                                if (company?.id) pushRecentlyViewedProduct(company.id, product.id);
                              }}
                            >
                              <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)]">
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                                ) : (
                                  <Package className="h-4 w-4 text-[var(--pc-muted)]" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <strong className="block truncate text-[var(--pc-text)]">{product.name}</strong>
                                <span className="block truncate text-xs text-[var(--pc-muted)]">
                                  {product.sku || product.category?.name || 'Produto'}
                                </span>
                              </span>
                              <span className="text-xs font-semibold text-[var(--pc-price)]">
                                {showPrices ? asCurrency(getProductPrice(product)) : 'Consultar'}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-3 py-2 text-sm text-[var(--pc-muted)]">
                <ArrowUpDown className="h-4 w-4" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortMode)}
                  className="border-0 bg-transparent font-medium text-[var(--pc-text)] outline-none"
                >
                  <option value="top_ranked">Top produtos</option>
                  <option value="sales_desc">Mais vendidos</option>
                  <option value="name_asc">Nome A-Z</option>
                  <option value="name_desc">Nome Z-A</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                </select>
              </div>

              <div className="inline-flex items-center overflow-hidden rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)]">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={[
                    'inline-flex h-11 w-11 items-center justify-center transition',
                    viewMode === 'grid'
                      ? 'bg-[var(--pc-filter-bg)] text-[var(--pc-filter-text)]'
                      : 'text-[var(--pc-muted)] hover:bg-[var(--pc-filter-bg)]/8',
                  ].join(' ')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={[
                    'inline-flex h-11 w-11 items-center justify-center border-l border-[var(--pc-card-border)] transition',
                    viewMode === 'list'
                      ? 'bg-[var(--pc-filter-bg)] text-[var(--pc-filter-text)]'
                      : 'text-[var(--pc-muted)] hover:bg-[var(--pc-filter-bg)]/8',
                  ].join(' ')}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen((prev) => !prev)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-4 text-sm font-medium text-[var(--pc-text)] md:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-3 py-1 text-xs font-semibold text-[var(--pc-muted)]">
              {filteredProducts.length} produto(s)
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-full border border-[var(--pc-card-border)] px-3 py-1 text-xs font-semibold text-[var(--pc-text)] transition hover:bg-[var(--pc-page-bg)]"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className={mobileFiltersOpen ? 'block' : 'hidden md:block'}>
            <div className="space-y-5 md:sticky md:top-[92px]">
              <div
                className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
                style={{ boxShadow: cardShadow }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[var(--pc-text)]">Categorias</h2>
                    <p className="text-sm text-[var(--pc-muted)]">Menu lateral automático do catálogo.</p>
                  </div>
                  {selectedCategory ? (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className="text-xs font-semibold text-[var(--pc-filter-bg)]"
                    >
                      Ver todas
                    </button>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {categoryTree.map((node) => (
                    <CategoryMenuNode
                      key={node.id}
                      node={node}
                      selectedCategory={selectedCategory}
                      expandedCategoryIds={expandedCategoryIds}
                      productCountMap={categoryCountMap}
                      onSelect={(id) => setSelectedCategory(id)}
                      onToggle={toggleCategoryExpanded}
                    />
                  ))}
                </div>
              </div>

              <div
                className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
                style={{ boxShadow: cardShadow }}
              >
                <h2 className="text-base font-bold text-[var(--pc-text)]">Faixa de preço</h2>
                <p className="mt-1 text-sm text-[var(--pc-muted)]">Ajuste o valor mínimo e máximo.</p>

                <div className="mt-5 px-1">
                  <Slider
                    value={priceRange}
                    min={priceBounds.min}
                    max={Math.max(priceBounds.max, priceBounds.min + 1)}
                    step={1}
                    onValueChange={(value) => {
                      if (value.length === 2) setPriceRange([value[0], value[1]]);
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pc-muted)]">
                      Mínimo
                    </span>
                    <input
                      type="number"
                      min={priceBounds.min}
                      max={priceRange[1]}
                      value={priceRange[0]}
                      onChange={(event) =>
                        setPriceRange(([_, max]) => [
                          Math.min(Number(event.target.value || 0), max),
                          max,
                        ])
                      }
                      className="h-11 w-full rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-4 text-sm outline-none"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pc-muted)]">
                      Máximo
                    </span>
                    <input
                      type="number"
                      min={priceRange[0]}
                      max={priceBounds.max}
                      value={priceRange[1]}
                      onChange={(event) =>
                        setPriceRange(([min]) => [
                          min,
                          Math.max(min, Number(event.target.value || 0)),
                        ])
                      }
                      className="h-11 w-full rounded-2xl border border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] px-4 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div
                className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
                style={{ boxShadow: cardShadow }}
              >
                <h2 className="text-base font-bold text-[var(--pc-text)]">Filtrar por atributos</h2>
                <p className="mt-1 text-sm text-[var(--pc-muted)]">Cor, material, tamanho e outros atributos.</p>

                <div className="mt-5 space-y-5">
                  {attributeFacets.length === 0 ? (
                    <p className="text-sm text-[var(--pc-muted)]">Nenhum atributo configurado para os produtos públicos.</p>
                  ) : (
                    attributeFacets.map((facet) => (
                      <div key={facet.id} className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pc-muted)]">
                          {facet.name}
                        </p>
                        <div className="space-y-2">
                          {facet.values.map((value) => {
                            const active = (selectedAttributeValues[facet.id] || []).includes(value.id);
                            return (
                              <label
                                key={value.id}
                                className={[
                                  'flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm transition',
                                  active
                                    ? 'border-[var(--pc-filter-bg)] bg-[var(--pc-filter-bg)]/8 text-[var(--pc-text)]'
                                    : 'border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] text-[var(--pc-muted)] hover:text-[var(--pc-text)]',
                                ].join(' ')}
                              >
                                <span className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleAttributeValue(facet.id, value.id)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span>{value.label}</span>
                                </span>
                                <span className="rounded-full border border-current/10 px-2 py-0.5 text-[11px] font-semibold">
                                  {value.count}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6 xl:min-w-0">
            <div className="xl:hidden">
              <ProductMiniShelf
                title="Recomendados para você"
                icon={<ShoppingCart className="h-5 w-5" />}
                products={recommendedProducts}
                company={company}
                metricsMap={productMetricsMap}
              />

              {recentlyViewedProducts.length > 0 ? (
                <ProductMiniShelf
                  title="Você viu recentemente"
                  icon={<Tag className="h-5 w-5" />}
                  products={recentlyViewedProducts}
                  company={company}
                  metricsMap={productMetricsMap}
                />
              ) : null}
            </div>

            <section
              className="rounded-[28px] border border-[var(--pc-card-border)] bg-[var(--pc-card-bg)] p-5"
              style={{ boxShadow: cardShadow }}
            >
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[var(--pc-text)]">Produtos</h2>
                  <p className="text-sm text-[var(--pc-muted)]">
                    {selectedCategory
                      ? `Filtrando em ${categoryNameMap.get(selectedCategory) || 'categoria selecionada'}`
                      : 'Todos os produtos disponíveis no catálogo.'}
                  </p>
                </div>
                <div className="text-sm text-[var(--pc-muted)]">
                  Ordenação atual: <span className="font-semibold text-[var(--pc-text)]">{sortBy.replace('_', ' ')}</span>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-[var(--pc-card-border)] bg-[var(--pc-page-bg)] p-8 text-center">
                  <div>
                    <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pc-filter-bg)]/12 text-[var(--pc-filter-bg)]">
                      <Package className="h-8 w-8" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-[var(--pc-text)]">Nenhum produto encontrado</h3>
                    <p className="mt-2 max-w-md text-sm text-[var(--pc-muted)]">
                      Ajuste os filtros de categoria, preço, atributos ou busca inteligente para encontrar outros itens.
                    </p>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="mt-5 rounded-2xl px-4 py-2 text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--pc-button-bg)',
                        color: 'var(--pc-button-text)',
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    'grid gap-5',
                    viewMode === 'list' ? 'grid-cols-1' : 'justify-center xl:justify-start',
                  ].join(' ')}
                  style={
                    viewMode === 'list'
                      ? undefined
                      : {
                        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))',
                        gap: 'clamp(0.5rem, 2vw, 1.25rem)',
                        justifyContent: 'center',
                      }
                  }
                >
                  {filteredProducts.map((product) => {
                    const productIdentifier = product.slug?.trim() ? product.slug : product.id;
                    const reviewHref = company?.slug
                      ? `/catalogo/${company.slug}/produto/${productIdentifier}?tab=avaliacoes`
                      : `/catalogo/produto/${product.id}?tab=avaliacoes`;

                    return (
                      <div
                        key={product.id}
                        className={viewMode === 'list' ? 'space-y-3' : 'h-full'}
                      >
                        {viewMode === 'grid' ? (
                          <ProductGridCard
                            product={product}
                            company={company}
                            showPrices={showPrices}
                            buttonText={buttonText}
                            reviewHref={reviewHref}
                            metricsMap={productMetricsMap}
                          />
                        ) : (
                          <ProductListCard
                            product={product}
                            company={company}
                            showPrices={showPrices}
                            buttonText={buttonText}
                            reviewHref={reviewHref}
                            metricsMap={productMetricsMap}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="hidden xl:block xl:min-w-0">
            <DiscoverySidebar
              sections={discoverySections}
              activeSection={activeDiscoverySection}
              onChange={setActiveDiscoverySection}
              company={company}
              metricsMap={productMetricsMap}
            />
          </div>
        </div>
      </div>

      <CatalogFooter
        company={company}
        showAccount
        accountHref={user ? customerOrdersPath : customerLoginPath}
        accountLabel={user ? 'Minha conta' : 'Entrar / Criar'}
      />
    </div>
  );
}
