export const DEFAULT_PRODUCT_SALE_UNIT = 'unidade';
export const CUSTOM_PRODUCT_SALE_UNIT_VALUE = '__custom__';

export const PRODUCT_SALE_UNIT_OPTIONS = [
  { value: 'unidade', label: 'Unidade', multiplier: 1 },
  { value: 'cento', label: 'Cento', multiplier: 100 },
  { value: '200 unidades', label: '200 unidades', multiplier: 200 },
  { value: '500 unidades', label: '500 unidades', multiplier: 500 },
  { value: 'milheiro', label: 'Milheiro', multiplier: 1000 },
  { value: 'kit', label: 'Kit', multiplier: 1 },
  { value: 'pacote', label: 'Pacote', multiplier: 1 },
] as const;

const PRODUCT_SALE_UNIT_MAP = new Map(
  PRODUCT_SALE_UNIT_OPTIONS.map((option) => [option.value, option]),
);

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

export const normalizeProductSaleUnit = (value?: string | null) => {
  const normalized = normalizeSpaces(String(value || '')).toLowerCase();
  return normalized || DEFAULT_PRODUCT_SALE_UNIT;
};

export const isProductSaleUnitPreset = (value?: string | null) =>
  PRODUCT_SALE_UNIT_MAP.has(normalizeProductSaleUnit(value));

export const resolveProductSaleUnit = (preset: string, custom?: string | null) => {
  if (preset === CUSTOM_PRODUCT_SALE_UNIT_VALUE) {
    return normalizeSpaces(String(custom || '')).toLowerCase();
  }

  return normalizeProductSaleUnit(preset);
};

export const getProductSaleUnitLabel = (
  value?: string | null,
  options?: { capitalize?: boolean },
) => {
  const normalized = normalizeProductSaleUnit(value);
  const preset = PRODUCT_SALE_UNIT_MAP.get(normalized);
  const resolved = preset?.value || normalized;
  return options?.capitalize ? capitalize(resolved) : resolved;
};

export const getProductSaleUnitPriceSuffix = (value?: string | null) =>
  `por ${getProductSaleUnitLabel(value)}`;

export const getProductSaleUnitMultiplier = (value?: string | null) => {
  const normalized = normalizeProductSaleUnit(value);
  const presetMultiplier = PRODUCT_SALE_UNIT_MAP.get(normalized)?.multiplier;
  if (presetMultiplier) return presetMultiplier;

  const numericMatch = normalized.match(/\b(\d+)\b/);
  if (!numericMatch) return 1;

  const parsed = Number(numericMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const getProductSaleEquivalentText = (
  value: string | null | undefined,
  quantity: number,
  productName?: string | null,
) => {
  const multiplier = getProductSaleUnitMultiplier(value);
  if (!Number.isFinite(multiplier) || multiplier <= 1) return null;

  const safeQuantity = Math.max(1, Number(quantity || 0));
  const total = safeQuantity * multiplier;
  const normalizedProductName = normalizeSpaces(String(productName || ''));

  if (!normalizedProductName) {
    return `${total} unidades`;
  }

  return `${total} unidades de ${normalizedProductName}`;
};
