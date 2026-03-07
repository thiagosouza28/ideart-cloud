import type { PaymentMethod } from '@/types/database';

export type CatalogLayoutMode = 'grid' | 'list';
export type CatalogCheckoutPaymentMethod = Extract<
  PaymentMethod,
  'pix' | 'dinheiro' | 'credito' | 'debito' | 'transferencia' | 'outro'
>;

export interface CatalogSettingsData {
  store_id: string;
  catalog_title: string;
  catalog_description: string;
  primary_color: string;
  secondary_color: string;
  text_color: string;
  accent_color: string;
  header_bg_color: string;
  header_text_color: string;
  footer_bg_color: string;
  footer_text_color: string;
  price_color: string;
  badge_bg_color: string;
  badge_text_color: string;
  button_bg_color: string;
  button_text_color: string;
  button_outline_color: string;
  card_bg_color: string;
  card_border_color: string;
  filter_bg_color: string;
  filter_text_color: string;
  button_text: string;
  contact_link: string | null;
  show_prices: boolean;
  show_contact: boolean;
  catalog_layout: CatalogLayoutMode;
  accepted_payment_methods: CatalogCheckoutPaymentMethod[];
}

const DEFAULT_PAYMENT_METHODS: CatalogCheckoutPaymentMethod[] = [
  'pix',
  'dinheiro',
  'credito',
  'debito',
  'transferencia',
  'outro',
];

const VALID_PAYMENT_METHODS = new Set<CatalogCheckoutPaymentMethod>(DEFAULT_PAYMENT_METHODS);

export const CATALOG_SETTINGS_SELECT = [
  'store_id',
  'catalog_title',
  'catalog_description',
  'primary_color',
  'secondary_color',
  'text_color',
  'accent_color',
  'header_bg_color',
  'header_text_color',
  'footer_bg_color',
  'footer_text_color',
  'price_color',
  'badge_bg_color',
  'badge_text_color',
  'button_bg_color',
  'button_text_color',
  'button_outline_color',
  'card_bg_color',
  'card_border_color',
  'filter_bg_color',
  'filter_text_color',
  'button_text',
  'contact_link',
  'show_prices',
  'show_contact',
  'catalog_layout',
  'accepted_payment_methods',
].join(', ');

export const catalogPaymentMethodLabels: Record<CatalogCheckoutPaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  transferencia: 'Transferência',
  outro: 'Outros',
};

export const suggestedCatalogColors: Pick<
  CatalogSettingsData,
  | 'primary_color'
  | 'secondary_color'
  | 'text_color'
  | 'accent_color'
  | 'header_bg_color'
  | 'header_text_color'
  | 'footer_bg_color'
  | 'footer_text_color'
  | 'price_color'
  | 'badge_bg_color'
  | 'badge_text_color'
  | 'button_bg_color'
  | 'button_text_color'
  | 'button_outline_color'
  | 'card_bg_color'
  | 'card_border_color'
  | 'filter_bg_color'
  | 'filter_text_color'
> = {
  primary_color: '#2563eb',
  secondary_color: '#0f172a',
  text_color: '#0f172a',
  accent_color: '#f59e0b',
  header_bg_color: '#0f172a',
  header_text_color: '#f8fafc',
  footer_bg_color: '#020617',
  footer_text_color: '#e2e8f0',
  price_color: '#ea580c',
  badge_bg_color: '#f59e0b',
  badge_text_color: '#1f1300',
  button_bg_color: '#2563eb',
  button_text_color: '#ffffff',
  button_outline_color: '#2563eb',
  card_bg_color: '#ffffff',
  card_border_color: '#dbe4f0',
  filter_bg_color: '#f59e0b',
  filter_text_color: '#1f1300',
};

export const defaultCatalogSettings = (
  storeId = '',
): CatalogSettingsData => ({
  store_id: storeId,
  catalog_title: 'Catálogo da loja',
  catalog_description: '',
  ...suggestedCatalogColors,
  button_text: 'Comprar agora',
  contact_link: null,
  show_prices: true,
  show_contact: true,
  catalog_layout: 'grid',
  accepted_payment_methods: [...DEFAULT_PAYMENT_METHODS],
});

export const normalizeCatalogPaymentMethods = (
  value: unknown,
): CatalogCheckoutPaymentMethod[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PAYMENT_METHODS];
  }

  const normalized = value
    .filter((method): method is CatalogCheckoutPaymentMethod => typeof method === 'string')
    .filter((method): method is CatalogCheckoutPaymentMethod =>
      VALID_PAYMENT_METHODS.has(method as CatalogCheckoutPaymentMethod),
    );

  return normalized.length > 0 ? normalized : [...DEFAULT_PAYMENT_METHODS];
};

export const normalizeCatalogSettings = (
  value: Partial<CatalogSettingsData> | null | undefined,
  storeId = '',
): CatalogSettingsData => {
  const defaults = defaultCatalogSettings(storeId);
  const primaryColor = value?.primary_color?.trim() || defaults.primary_color;
  const secondaryColor = value?.secondary_color?.trim() || defaults.secondary_color;
  const textColor = value?.text_color?.trim() || defaults.text_color;
  const accentColor = value?.accent_color?.trim() || defaults.accent_color;
  const headerBgColor = value?.header_bg_color?.trim() || secondaryColor;
  const headerTextColor = value?.header_text_color?.trim() || defaults.header_text_color;
  const footerBgColor =
    value?.footer_bg_color?.trim() ||
    value?.header_bg_color?.trim() ||
    headerBgColor ||
    defaults.footer_bg_color;
  const footerTextColor =
    value?.footer_text_color?.trim() ||
    value?.header_text_color?.trim() ||
    headerTextColor ||
    defaults.footer_text_color;
  const priceColor =
    value?.price_color?.trim() ||
    value?.accent_color?.trim() ||
    primaryColor;
  const badgeBgColor =
    value?.badge_bg_color?.trim() ||
    value?.accent_color?.trim() ||
    accentColor;
  const badgeTextColor = value?.badge_text_color?.trim() || defaults.badge_text_color;
  const buttonBgColor = value?.button_bg_color?.trim() || primaryColor;
  const buttonTextColor = value?.button_text_color?.trim() || defaults.button_text_color;
  const buttonOutlineColor =
    value?.button_outline_color?.trim() ||
    value?.button_bg_color?.trim() ||
    buttonBgColor;
  const cardBgColor = value?.card_bg_color?.trim() || defaults.card_bg_color;
  const cardBorderColor = value?.card_border_color?.trim() || defaults.card_border_color;
  const filterBgColor =
    value?.filter_bg_color?.trim() ||
    value?.button_bg_color?.trim() ||
    buttonBgColor;
  const filterTextColor = value?.filter_text_color?.trim() || defaults.filter_text_color;

  return {
    store_id: value?.store_id || defaults.store_id,
    catalog_title: value?.catalog_title?.trim() || defaults.catalog_title,
    catalog_description: value?.catalog_description?.trim() || defaults.catalog_description,
    primary_color: primaryColor,
    secondary_color: secondaryColor,
    text_color: textColor,
    accent_color: accentColor,
    header_bg_color: headerBgColor,
    header_text_color: headerTextColor,
    footer_bg_color: footerBgColor,
    footer_text_color: footerTextColor,
    price_color: priceColor,
    badge_bg_color: badgeBgColor,
    badge_text_color: badgeTextColor,
    button_bg_color: buttonBgColor,
    button_text_color: buttonTextColor,
    button_outline_color: buttonOutlineColor,
    card_bg_color: cardBgColor,
    card_border_color: cardBorderColor,
    filter_bg_color: filterBgColor,
    filter_text_color: filterTextColor,
    button_text: value?.button_text?.trim() || defaults.button_text,
    contact_link: value?.contact_link?.trim() || null,
    show_prices: value?.show_prices ?? defaults.show_prices,
    show_contact: value?.show_contact ?? defaults.show_contact,
    catalog_layout: value?.catalog_layout === 'list' ? 'list' : 'grid',
    accepted_payment_methods: normalizeCatalogPaymentMethods(value?.accepted_payment_methods),
  };
};

export const hydrateCatalogCompany = <
  TCompany extends {
    id: string;
    name?: string | null;
  },
>(
  company: TCompany,
  settings: Partial<CatalogSettingsData> | null | undefined,
) => {
  const resolved = normalizeCatalogSettings(settings, company.id);

  return {
    ...company,
    catalog_title: resolved.catalog_title,
    catalog_description: resolved.catalog_description,
    catalog_button_text: resolved.button_text,
    catalog_show_prices: resolved.show_prices,
    catalog_show_contact: resolved.show_contact,
    catalog_contact_url: resolved.contact_link,
    catalog_primary_color: resolved.button_bg_color,
    catalog_secondary_color: resolved.header_bg_color,
    catalog_accent_color: resolved.accent_color,
    catalog_text_color: resolved.text_color,
    catalog_header_bg_color: resolved.header_bg_color,
    catalog_header_text_color: resolved.header_text_color,
    catalog_footer_bg_color: resolved.footer_bg_color,
    catalog_footer_text_color: resolved.footer_text_color,
    catalog_price_color: resolved.price_color,
    catalog_badge_bg_color: resolved.badge_bg_color,
    catalog_badge_text_color: resolved.badge_text_color,
    catalog_button_bg_color: resolved.button_bg_color,
    catalog_button_text_color: resolved.button_text_color,
    catalog_button_outline_color: resolved.button_outline_color,
    catalog_card_bg_color: resolved.card_bg_color,
    catalog_card_border_color: resolved.card_border_color,
    catalog_filter_bg_color: resolved.filter_bg_color,
    catalog_filter_text_color: resolved.filter_text_color,
    catalog_layout: resolved.catalog_layout,
    accepted_payment_methods: resolved.accepted_payment_methods,
  };
};

export const fetchCatalogSettings = async (
  client: {
    from: (table: 'catalog_settings') => {
      select: (columns: string) => {
        eq: (column: 'store_id', value: string) => {
          maybeSingle: () => Promise<{ data: Partial<CatalogSettingsData> | null; error: Error | null }>;
        };
      };
    };
  },
  storeId: string,
) => {
  const { data, error } = await client
    .from('catalog_settings')
    .select(CATALOG_SETTINGS_SELECT)
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeCatalogSettings(data, storeId);
};
