import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, ShoppingCart } from 'lucide-react';
import { ensurePublicStorageUrl } from '@/lib/storage';

export interface CatalogChromeCompany {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  logo_url?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  catalog_contact_url?: string | null;
  catalog_primary_color?: string | null;
  catalog_secondary_color?: string | null;
  catalog_accent_color?: string | null;
  catalog_text_color?: string | null;
  catalog_header_bg_color?: string | null;
  catalog_header_text_color?: string | null;
  catalog_footer_bg_color?: string | null;
  catalog_footer_text_color?: string | null;
  catalog_badge_bg_color?: string | null;
  catalog_badge_text_color?: string | null;
  catalog_button_bg_color?: string | null;
  catalog_button_text_color?: string | null;
  catalog_button_outline_color?: string | null;
}

const getInitials = (value?: string | null) => {
  const safe = (value || 'Catálogo').trim();
  if (!safe) return 'C';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const normalizeHexColor = (value?: string | null, fallback = '#1a3a8f') => {
  const safe = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(safe)) return safe;
  if (/^#[0-9a-f]{3}$/i.test(safe)) {
    return `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}`;
  }
  return fallback;
};

const withAlpha = (value?: string | null, alpha = 'ff', fallback = '#1a3a8f') =>
  `${normalizeHexColor(value, fallback)}${alpha}`;

const resolveCatalogPath = (company?: CatalogChromeCompany | null) => {
  if (company?.slug) return `/catalogo/${company.slug}`;
  if (company?.id) return `/loja/${company.id}`;
  return '/catalogo';
};

const resolveLogoUrl = (logoUrl?: string | null) =>
  ensurePublicStorageUrl('product-images', logoUrl) || null;

const resolveCatalogTheme = (company?: CatalogChromeCompany | null) => {
  const buttonBg = normalizeHexColor(
    company?.catalog_button_bg_color || company?.catalog_primary_color,
    '#1a3a8f',
  );
  const buttonText = normalizeHexColor(company?.catalog_button_text_color, '#ffffff');
  const buttonOutline = normalizeHexColor(
    company?.catalog_button_outline_color || company?.catalog_button_bg_color || company?.catalog_primary_color,
    buttonBg,
  );
  const headerBg = normalizeHexColor(
    company?.catalog_header_bg_color || company?.catalog_secondary_color,
    '#0f1b3d',
  );
  const headerText = normalizeHexColor(company?.catalog_header_text_color, '#ffffff');
  const footerBg = normalizeHexColor(
    company?.catalog_footer_bg_color || company?.catalog_secondary_color,
    headerBg,
  );
  const footerText = normalizeHexColor(
    company?.catalog_footer_text_color || company?.catalog_header_text_color,
    '#ffffff',
  );
  const badgeBg = normalizeHexColor(
    company?.catalog_badge_bg_color || company?.catalog_accent_color,
    '#c9a84c',
  );
  const badgeText = normalizeHexColor(company?.catalog_badge_text_color, '#2f2406');

  return {
    buttonBg,
    buttonText,
    buttonOutline,
    headerBg,
    headerText,
    headerBorder: withAlpha(company?.catalog_header_text_color, '33', '#ffffff'),
    headerSurface: withAlpha(company?.catalog_header_text_color, '14', '#ffffff'),
    headerSubtle: withAlpha(company?.catalog_header_text_color, 'bf', '#ffffff'),
    footerBg,
    footerText,
    footerBorder: withAlpha(company?.catalog_footer_text_color, '33', '#ffffff'),
    footerSurface: withAlpha(company?.catalog_footer_text_color, '14', '#ffffff'),
    footerSubtle: withAlpha(company?.catalog_footer_text_color, 'bf', '#ffffff'),
    badgeBg,
    badgeText,
    heroBackground: `linear-gradient(135deg, ${headerBg} 0%, ${buttonBg} 100%)`,
    heroText: headerText,
    heroSubtle: withAlpha(company?.catalog_header_text_color, 'df', '#ffffff'),
  };
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
  const brandName = company?.name || 'Catálogo';
  const brandLogoUrl = resolveLogoUrl(company?.logo_url);
  const brandSub = subtitle || [company?.city, company?.state].filter(Boolean).join(', ') || 'Catálogo público';
  const hasContact = Boolean(company?.catalog_contact_url || company?.whatsapp);
  const theme = resolveCatalogTheme(company);
  const headerStyle: CSSProperties = {
    backgroundColor: theme.headerBg,
    color: theme.headerText,
    borderBottomColor: theme.headerBorder,
  };
  const headerOutlineStyle: CSSProperties = {
    borderColor: theme.headerBorder,
    backgroundColor: theme.headerSurface,
    color: theme.headerText,
  };
  const primaryStyle: CSSProperties = {
    backgroundColor: theme.buttonBg,
    color: theme.buttonText,
  };

  return (
    <header
      className={`${sticky ? 'sticky top-0' : ''} z-40 min-h-[68px] py-2 md:py-0 border-b`}
      style={headerStyle}
    >
      <div className="mx-auto flex h-full min-h-[60px] w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {showBack && (
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100"
              onClick={onBack}
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{backLabel}</span>
            </button>
          )}
          <div className="flex min-w-0 items-center gap-3">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={`Logo da ${brandName}`}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                style={primaryStyle}
              >
                {getInitials(brandName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{brandName}</p>
              <p className="hidden truncate text-[11px] sm:block opacity-80" style={{ color: theme.headerSubtle }}>{brandSub}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 md:gap-3">
          {typeof cartCount === 'number' && onCartClick && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all hover:scale-[1.02]"
              style={headerOutlineStyle}
              onClick={onCartClick}
            >
              <ShoppingCart size={16} />
              <span className="flex items-center gap-1">
                {cartCount} <span className="hidden sm:inline">{cartCount === 1 ? 'item' : 'itens'}</span>
              </span>
            </button>
          )}

          {showAccount && (
            <Link
              to={accountHref}
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition-all hover:scale-[1.02] hover:opacity-90"
              style={headerOutlineStyle}
            >
              <span className="hidden md:inline">{accountLabel}</span>
              <span className="md:hidden">Conta</span>
            </Link>
          )}

          {showContact && hasContact && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all hover:scale-[1.02] hover:opacity-90"
              style={primaryStyle}
              onClick={() => openCatalogContact(company)}
            >
              <MessageCircle size={16} />
              <span className="hidden md:inline">Falar no WhatsApp</span>
              <span className="md:hidden">WhatsApp</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

type CatalogHeroProps = {
  company?: CatalogChromeCompany | null;
  badge?: string;
  title: string;
  description?: string;
  metaItems?: Array<{
    icon: 'phone' | 'mail' | 'pin';
    label: string;
  }>;
};

export function CatalogHero({ company, badge, title, description, metaItems = [] }: CatalogHeroProps) {
  const theme = resolveCatalogTheme(company);

  return (
    <section
      className="relative overflow-hidden"
      style={{ background: theme.heroBackground, color: theme.heroText }}
    >
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.24) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {badge && (
          <p
            className="mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
          >
            {badge}
          </p>
        )}
        <h1 className="text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-tight">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm" style={{ color: theme.heroSubtle }}>{description}</p>}
        {metaItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: theme.heroSubtle }}>
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
  const brandName = company?.name || 'Catálogo';
  const brandLogoUrl = resolveLogoUrl(company?.logo_url);
  const brandSub = [company?.city, company?.state].filter(Boolean).join(', ') || 'Catálogo público';
  const hasContact = Boolean(company?.catalog_contact_url || company?.whatsapp);
  const catalogPath = resolveCatalogPath(company);
  const theme = resolveCatalogTheme(company);
  const footerStyle: CSSProperties = {
    backgroundColor: theme.footerBg,
    color: theme.footerText,
  };
  const footerOutlineStyle: CSSProperties = {
    borderColor: theme.footerBorder,
    backgroundColor: theme.footerSurface,
    color: theme.footerText,
  };
  const primaryStyle: CSSProperties = {
    backgroundColor: theme.buttonBg,
    color: theme.buttonText,
  };

  return (
    <footer className="mt-12" style={footerStyle}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt={`Logo da ${brandName}`}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
              style={primaryStyle}
            >
              {getInitials(brandName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{brandName}</p>
            <p className="truncate text-xs" style={{ color: theme.footerSubtle }}>{brandSub}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {company?.phone && (
            <a
              href={`tel:${company.phone}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:opacity-90"
              style={footerOutlineStyle}
            >
              <Phone size={14} />
              Ligar
            </a>
          )}
          {company?.email && (
            <a
              href={`mailto:${company.email}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:opacity-90"
              style={footerOutlineStyle}
            >
              <Mail size={14} />
              E-mail
            </a>
          )}
          {hasContact && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:opacity-90"
              style={primaryStyle}
              onClick={() => openCatalogContact(company)}
            >
              <MessageCircle size={14} />
              Falar no WhatsApp
            </button>
          )}
          {showAccount && (
            <Link
              to={accountHref}
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold hover:opacity-90"
              style={footerOutlineStyle}
            >
              {accountLabel}
            </Link>
          )}
          {!showAccount && (
            <Link
              to={catalogPath}
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold hover:opacity-90"
              style={footerOutlineStyle}
            >
              Ver catálogo
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
