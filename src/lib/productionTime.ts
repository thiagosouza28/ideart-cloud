type EstimatedDeliveryParams = {
  productionTimeDays: number | null | undefined;
  companyDeliveryDays?: number | null | undefined;
  baseDate?: Date;
};

export type EstimatedDeliveryInfo = {
  productionTimeDays: number;
  companyDeliveryDays: number;
  totalDays: number;
  date: Date;
  isoDate: string;
  formattedDate: string;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const normalizeProductionTimeDays = (value: unknown): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const normalized = Math.trunc(numericValue);
  if (normalized < 0) return null;
  return normalized;
};

export const parseDateValue = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toIsoDate = (value: Date | null | undefined): string | null => {
  if (!value || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDatePtBr = (value: string | Date | null | undefined): string => {
  const parsed = parseDateValue(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('pt-BR');
};

export const isBusinessDay = (value: Date): boolean => {
  const day = value.getDay();
  return day !== 0 && day !== 6;
};

export const formatBusinessDaysLabel = (value: number): string =>
  `${value} ${value === 1 ? 'dia util' : 'dias uteis'}`;

export const addBusinessDays = (
  baseDate: Date,
  businessDays: number,
): Date => {
  const result = new Date(baseDate);
  result.setHours(12, 0, 0, 0);

  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
  }

  let remainingDays = Math.max(0, Math.trunc(Number(businessDays) || 0));

  while (remainingDays > 0) {
    result.setDate(result.getDate() + 1);
    if (!isBusinessDay(result)) {
      continue;
    }
    remainingDays -= 1;
  }

  return result;
};

export const resolveCompanyDeliveryTimeDays = (company: unknown): number => {
  if (!company || typeof company !== 'object') return 0;
  const source = company as Record<string, unknown>;
  const keys = [
    'prazo_entrega_loja_dias',
    'delivery_time_days',
    'delivery_days',
    'prazo_entrega_dias',
  ];

  for (const key of keys) {
    const value = normalizeProductionTimeDays(source[key]);
    if (value !== null) return value;
  }

  return 0;
};

export const calculateEstimatedDeliveryInfo = ({
  productionTimeDays,
  companyDeliveryDays = 0,
  baseDate,
}: EstimatedDeliveryParams): EstimatedDeliveryInfo | null => {
  const normalizedProductionTime = normalizeProductionTimeDays(productionTimeDays);
  if (normalizedProductionTime === null) return null;

  const normalizedCompanyDelivery = normalizeProductionTimeDays(companyDeliveryDays) ?? 0;
  const totalDays = normalizedProductionTime + normalizedCompanyDelivery;
  const estimatedDate = addBusinessDays(baseDate ? new Date(baseDate) : new Date(), totalDays);

  const isoDate = toIsoDate(estimatedDate);
  if (!isoDate) return null;

  return {
    productionTimeDays: normalizedProductionTime,
    companyDeliveryDays: normalizedCompanyDelivery,
    totalDays,
    date: estimatedDate,
    isoDate,
    formattedDate: formatDatePtBr(estimatedDate),
  };
};
