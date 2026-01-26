export const M2_ATTRIBUTE_KEYS = {
  widthCm: '__m2_width_cm',
  heightCm: '__m2_height_cm',
  areaM2: '__m2_area_m2',
};

const normalizeUnit = (value?: string | null) =>
  (value || '').toLowerCase().replace(/\s+/g, '');

export const isAreaUnit = (unit?: string | null) => {
  const normalized = normalizeUnit(unit);
  const m2 = `m\u00B2`;
  return normalized === m2 || normalized === 'm2' || normalized === 'm^2';
};

export const parseMeasurementInput = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const calculateAreaM2 = (widthCm: number, heightCm: number) =>
  (widthCm / 100) * (heightCm / 100);

export const formatAreaM2 = (area: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(area);

export const parseM2Attributes = (attributes?: Record<string, string> | null) => {
  if (!attributes) {
    return {
      widthCm: null,
      heightCm: null,
      areaM2: null,
    };
  }

  const widthCm = parseMeasurementInput(attributes[M2_ATTRIBUTE_KEYS.widthCm]);
  const heightCm = parseMeasurementInput(attributes[M2_ATTRIBUTE_KEYS.heightCm]);
  const areaM2 = parseMeasurementInput(attributes[M2_ATTRIBUTE_KEYS.areaM2]);

  return {
    widthCm,
    heightCm,
    areaM2,
  };
};

export const buildM2Attributes = (
  attributes: Record<string, string> | null | undefined,
  dims: {
    widthCm?: number | null;
    heightCm?: number | null;
    areaM2?: number | null;
  },
) => {
  const next: Record<string, string> = { ...(attributes || {}) };

  if (dims.widthCm !== undefined) {
    if (dims.widthCm === null) {
      delete next[M2_ATTRIBUTE_KEYS.widthCm];
    } else {
      next[M2_ATTRIBUTE_KEYS.widthCm] = String(dims.widthCm);
    }
  }

  if (dims.heightCm !== undefined) {
    if (dims.heightCm === null) {
      delete next[M2_ATTRIBUTE_KEYS.heightCm];
    } else {
      next[M2_ATTRIBUTE_KEYS.heightCm] = String(dims.heightCm);
    }
  }

  if (dims.areaM2 !== undefined) {
    if (dims.areaM2 === null) {
      delete next[M2_ATTRIBUTE_KEYS.areaM2];
    } else {
      next[M2_ATTRIBUTE_KEYS.areaM2] = String(dims.areaM2);
    }
  }

  return next;
};

export const stripM2Attributes = (attributes?: Record<string, string> | null) => {
  if (!attributes) return {};
  const { [M2_ATTRIBUTE_KEYS.widthCm]: _width, [M2_ATTRIBUTE_KEYS.heightCm]: _height, [M2_ATTRIBUTE_KEYS.areaM2]: _area, ...rest } = attributes;
  return rest;
};
