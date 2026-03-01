import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, ShoppingCart } from 'lucide-react';

export interface CatalogChromeCompany {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  catalog_contact_url?: string | null;
}

const getInitials = (value?: string | null) => {
  const safe = (value || 'Catalogo').trim();
  if (!safe) return 'C';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const resolveCatalogPath = (company?: CatalogChromeCompany | null) => {
  if (company?.slug) return `/catalogo/${company.slug}`;
  if (company?.id) return `/loja/${company.id}`;
  return '/catalogo';
};

const openCatalogContact = (company?: CatalogChromeCompany | null) => {
  if (!company) return;
  if (company.catalog_contact_url) {
    window.open(company.catalog_contact_url, '_blank');
    return;
  }
  if (!company.whatsapp) return;
  const phone = company.whatsapp.replace(/\D/g, '');
  window.open(`https://wa.me/${phone}`, '_blank');
};

type CatalogTopNavProps = {
  company?: CatalogChromeCompany | null;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  sticky?: boolean;
  cartCount?: number;
  onCartClick?: () => void;
  showAccount?: boolean;
  accountHref?: string;
  accountLabel?: string;
  showContact?: boolean;
};

export function CatalogTopNav({
  company,
  subtitle,
  showBack = false,
  onBack,
  backLabel = 'Voltar',
  sticky = true,
  cartCount,
  onCartClick,
  showAccount = false,
  accountHref = '/minha-conta/pedidos',
  accountLabel = 'Minha conta',
  showContact = false,
}: CatalogTopNavProps) {
  const brandName = company?.name || 'Catalogo';
  const brandSub = subtitle || [company?.city, company?.state].filter(Boolean).join(', ') || 'Catalogo publico';
  const hasContact = Boolean(company?.catalog_contact_url || company?.whatsapp);

  return (
    <header className={`${sticky ? 'sticky top-0' : ''} z-40 h-[68px] border-b border-white/20 bg-[#0f1b3d] text-white`}>
      <div className="mx-auto flex h-full w-[min(1220px,calc(100%-40px))] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {showBack && (
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100"
              onClick={onBack}
            >
              <ArrowLeft size={16} />
              {backLabel}
            </button>
          )}
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#3d8bef] text-xs font-bold">
              {getInitials(brandName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{brandName}</p>
              <p className="truncate text-xs text-white/75">{brandSub}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {typeof cartCount === 'number' && onCartClick && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 text-sm font-medium"
              onClick={onCartClick}
            >
              <ShoppingCart size={14} />
              {cartCount} {cartCount === 1 ? 'item' : 'itens'}
            </button>
          )}

          {showAccount && (
            <Link
              to={accountHref}
              className="inline-flex h-9 items-center rounded-xl border border-white/45 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              {accountLabel}
            </Link>
          )}

          {showContact && hasContact && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#1a3a8f] px-4 text-sm font-semibold text-white hover:opacity-90"
              onClick={() => openCatalogContact(company)}
            >
              <MessageCircle size={14} />
              WhatsApp
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

type CatalogHeroProps = {
  badge?: string;
  title: string;
  description?: string;
  metaItems?: Array<{
    icon: 'phone' | 'mail' | 'pin';
    label: string;
  }>;
};

export function CatalogHero({ badge, title, description, metaItems = [] }: CatalogHeroProps) {
  return (
    <section className="relative overflow-hidden bg-[#1a3a8f] text-white">
      <div
        className="absolute inset-0 opacity-35"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.24) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      />
      <div className="relative mx-auto w-[min(1220px,calc(100%-40px))] py-8">
        {badge && (
          <p className="mb-3 inline-flex rounded-full bg-[#c9a84c] px-3 py-1 text-xs font-semibold text-[#2f2406]">
            {badge}
          </p>
        )}
        <h1 className="text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-tight">{title}</h1>
        {description && <p className="mt-2 text-sm text-white/85">{description}</p>}
        {metaItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/90">
            {metaItems.map((item) => {
              const Icon = item.icon === 'phone' ? Phone : item.icon === 'mail' ? Mail : MapPin;
              return (
                <span key={`${item.icon}-${item.label}`} className="inline-flex items-center gap-2">
                  <Icon size={15} />
                  {item.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

type CatalogFooterProps = {
  company?: CatalogChromeCompany | null;
  showAccount?: boolean;
  accountHref?: string;
  accountLabel?: string;
};

export function CatalogFooter({
  company,
  showAccount = false,
  accountHref = '/minha-conta/pedidos',
  accountLabel = 'Minha conta',
}: CatalogFooterProps) {
  const brandName = company?.name || 'Catalogo';
  const brandSub = [company?.city, company?.state].filter(Boolean).join(', ') || 'Catalogo publico';
  const hasContact = Boolean(company?.catalog_contact_url || company?.whatsapp);
  const catalogPath = resolveCatalogPath(company);

  return (
    <footer className="mt-12 bg-[#0f1b3d] text-white">
      <div className="mx-auto flex w-[min(1220px,calc(100%-40px))] flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#3d8bef] text-xs font-bold">
            {getInitials(brandName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{brandName}</p>
            <p className="truncate text-xs text-white/75">{brandSub}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {company?.phone && (
            <a
              href={`tel:${company.phone}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/45 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Phone size={14} />
              Ligar
            </a>
          )}
          {company?.email && (
            <a
              href={`mailto:${company.email}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/45 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Mail size={14} />
              E-mail
            </a>
          )}
          {hasContact && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3d8bef] px-4 text-sm font-semibold text-white hover:opacity-90"
              onClick={() => openCatalogContact(company)}
            >
              <MessageCircle size={14} />
              WhatsApp
            </button>
          )}
          {showAccount && (
            <Link
              to={accountHref}
              className="inline-flex h-10 items-center rounded-xl border border-white/45 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              {accountLabel}
            </Link>
          )}
          {!showAccount && (
            <Link
              to={catalogPath}
              className="inline-flex h-10 items-center rounded-xl border border-white/45 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              Ver catalogo
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
