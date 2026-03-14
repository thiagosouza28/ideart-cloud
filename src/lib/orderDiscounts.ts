export type DiscountType = 'fixed' | 'percent';

type DiscountInput = {
  baseAmount: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
};

const MAX_PERCENT_DISCOUNT = 100;

export const roundCurrency = (value: number) => {
  const numericValue = Number.isFinite(value) ? value : 0;
  return Math.round(numericValue * 100) / 100;
};

export const normalizeDiscountType = (value?: string | null): DiscountType =>
  value === 'percent' ? 'percent' : 'fixed';

export const normalizeDiscountValue = (value?: number | null) =>
  Math.max(0, roundCurrency(Number(value || 0)));

export const calculateBaseAmount = (quantity: number, unitPrice: number) =>
  roundCurrency(Math.max(0, Number(quantity || 0)) * Math.max(0, Number(unitPrice || 0)));

export const calculateDiscountAmount = ({
  baseAmount,
  discountType,
  discountValue,
}: DiscountInput) => {
  const normalizedBase = Math.max(0, roundCurrency(baseAmount));
  const normalizedType = normalizeDiscountType(discountType);
  const normalizedValue = normalizeDiscountValue(discountValue);

  if (normalizedBase <= 0 || normalizedValue <= 0) {
    return 0;
  }

  if (normalizedType === 'percent') {
    const percentage = Math.min(MAX_PERCENT_DISCOUNT, normalizedValue);
    return roundCurrency(normalizedBase * (percentage / 100));
  }

  return roundCurrency(Math.min(normalizedBase, normalizedValue));
};

export const calculateDiscountValueFromAmount = ({
  baseAmount,
  discountAmount,
  discountType,
}: {
  baseAmount: number;
  discountAmount?: number | null;
  discountType?: DiscountType | null;
}) => {
  const normalizedType = normalizeDiscountType(discountType);
  const normalizedBase = Math.max(0, roundCurrency(baseAmount));
  const normalizedDiscount = Math.max(0, roundCurrency(Number(discountAmount || 0)));

  if (normalizedDiscount <= 0) {
    return 0;
  }

  if (normalizedType === 'percent') {
    if (normalizedBase <= 0) {
      return 0;
    }
    return roundCurrency(Math.min(MAX_PERCENT_DISCOUNT, (normalizedDiscount / normalizedBase) * 100));
  }

  return normalizedDiscount;
};

export const resolveDiscountState = ({
  baseAmount,
  discountAmount,
  discountType,
  discountValue,
}: {
  baseAmount: number;
  discountAmount?: number | null;
  discountType?: DiscountType | null;
  discountValue?: number | null;
}) => {
  const normalizedType = normalizeDiscountType(discountType);
  const fallbackValue = calculateDiscountValueFromAmount({
    baseAmount,
    discountAmount,
    discountType: normalizedType,
  });
  const normalizedStoredValue = normalizeDiscountValue(discountValue);
  const resolvedValue =
    discountValue === null ||
    discountValue === undefined ||
    (normalizedStoredValue <= 0 && Number(discountAmount || 0) > 0)
      ? fallbackValue
      : normalizedStoredValue;

  return {
    discountType: normalizedType,
    discountValue: resolvedValue,
    discountAmount: calculateDiscountAmount({
      baseAmount,
      discountType: normalizedType,
      discountValue: resolvedValue,
    }),
  };
};

export const calculateLineTotal = ({
  quantity,
  unitPrice,
  discountType,
  discountValue,
}: {
  quantity: number;
  unitPrice: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
}) => {
  const baseAmount = calculateBaseAmount(quantity, unitPrice);
  const discountAmount = calculateDiscountAmount({
    baseAmount,
    discountType,
    discountValue,
  });

  return roundCurrency(Math.max(0, baseAmount - discountAmount));
};
