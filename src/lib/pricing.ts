import type { PriceTier, Product } from '@/types/database';

type ProductPricing = Pick<
  Product,
  'base_cost' | 'labor_cost' | 'expense_percentage' | 'waste_percentage' | 'profit_margin' | 'final_price'
>;

export const calculateMarkupFactor = (expensePercentage = 0, profitPercentage = 0) => {
  const appliedExpense = Number(expensePercentage) || 0;
  const appliedProfit = Number(profitPercentage) || 0;
  const denominator = 100 - (appliedExpense + appliedProfit);

  if (denominator <= 0) return 1;
  return 100 / denominator;
};

export const calculateEstimatedProfit = (cost: number, price: number) => {
  const normalizedCost = Number(cost) || 0;
  const normalizedPrice = Number(price) || 0;
  return normalizedPrice - normalizedCost;
};

export const calculateRealMargin = (cost: number, price: number) => {
  const normalizedPrice = Number(price) || 0;
  if (normalizedPrice <= 0) return 0;
  return (calculateEstimatedProfit(cost, price) / normalizedPrice) * 100;
};

export const calculatePriceByMultiplier = (cost: number, multiplier: number) =>
  (Number(cost) || 0) * Math.max(Number(multiplier) || 0, 0);

export const calculatePriceByMargin = (cost: number, marginPercentage: number) =>
  (Number(cost) || 0) * (1 + (Number(marginPercentage) || 0) / 100);

export const buildPriceSimulation = ({
  cost,
  expensePercentage = 0,
  desiredMarginPercentage = 0,
  manualMarkup,
}: {
  cost: number;
  expensePercentage?: number;
  desiredMarginPercentage?: number;
  manualMarkup?: number | null;
}) => {
  const normalizedCost = Number(cost) || 0;
  const markupSuggested = calculateMarkupFactor(expensePercentage, desiredMarginPercentage);
  const appliedMarkup = manualMarkup && manualMarkup > 0 ? manualMarkup : markupSuggested;
  const suggestedPrice = normalizedCost * appliedMarkup;
  const estimatedProfit = calculateEstimatedProfit(normalizedCost, suggestedPrice);
  const realMargin = calculateRealMargin(normalizedCost, suggestedPrice);

  return {
    cost: normalizedCost,
    markupSuggested,
    appliedMarkup,
    suggestedPrice,
    estimatedProfit,
    realMargin,
  };
};

export const calculateSuggestedPrice = (
  product: ProductPricing,
  suppliesCost = 0,
) => {
  const baseCost = Number(product.base_cost) || 0;
  const laborCost = Number(product.labor_cost) || 0;
  const wastePercentage = Number(product.waste_percentage) || 0;
  const profitMargin = Number(product.profit_margin) || 0;
  const totalCost = baseCost + laborCost + suppliesCost;
  const costWithWaste = totalCost * (1 + wastePercentage / 100);
  return calculatePriceByMargin(costWithWaste, profitMargin);
};

export const isPromotionActive = (product: Product) => {
  if (!product.promo_price) return false;

  const now = new Date();
  const start = product.promo_start_at ? new Date(product.promo_start_at) : null;
  const end = product.promo_end_at ? new Date(product.promo_end_at) : null;

  if (start && now < start) return false;
  if (end && now > end) return false;

  return true;
};

export const resolveSuggestedPrice = (
  product: Product,
  quantity: number,
  priceTiers: PriceTier[],
  suppliesCost = 0,
) => {
  // 1. Check for active promotion first (it overrides everything)
  if (isPromotionActive(product) && product.promo_price !== null) {
    return Number(product.promo_price);
  }

  // 2. Check for volume-based price tiers
  const tiers = priceTiers.filter((tier) => tier.product_id === product.id);
  if (tiers.length > 0) {
    const tier = tiers.find(
      (t) =>
        quantity >= t.min_quantity &&
        (t.max_quantity === null || quantity <= t.max_quantity),
    );
    if (tier) return Number(tier.price);
  }

  // 3. Fallback to manually set fixed final price
  if (product.final_price !== null && product.final_price !== undefined) {
    return Number(product.final_price);
  }

  // 4. Default to calculated suggested price
  return calculateSuggestedPrice(product, suppliesCost);
};

export const getBasePrice = (
  product: Product,
  quantity: number = 1,
  priceTiers: PriceTier[] = [],
  suppliesCost = 0,
) => {
  // 1. Check for volume-based price tiers
  const tiers = priceTiers.filter((tier) => tier.product_id === product.id);
  if (tiers.length > 0) {
    const tier = tiers.find(
      (t) =>
        quantity >= t.min_quantity &&
        (t.max_quantity === null || quantity <= t.max_quantity),
    );
    if (tier) return Number(tier.price);
  }

  // 2. Fallback to manually set fixed final price
  if (product.final_price !== null && product.final_price !== undefined) {
    return Number(product.final_price);
  }

  // 3. Default to calculated suggested price
  return calculateSuggestedPrice(product, suppliesCost);
};

export const resolveProductPrice = (
  product: Product,
  quantity: number,
  priceTiers: PriceTier[] = [],
  suppliesCost = 0,
) => {
  if (isPromotionActive(product) && product.promo_price !== null) {
    return Number(product.promo_price);
  }
  const hasTiers = priceTiers.some((tier) => tier.product_id === product.id);
  if (hasTiers) {
    return resolveSuggestedPrice(product, quantity, priceTiers, suppliesCost);
  }
  if (product.catalog_price !== null && product.catalog_price !== undefined) {
    return Number(product.catalog_price);
  }
  return resolveSuggestedPrice(product, quantity, priceTiers, suppliesCost);
};

export const resolveProductBasePrice = (
  product: Product,
  quantity: number = 1,
  priceTiers: PriceTier[] = [],
  suppliesCost = 0,
) => {
  const hasTiers = priceTiers.some((tier) => tier.product_id === product.id);
  if (hasTiers) {
    return getBasePrice(product, quantity, priceTiers, suppliesCost);
  }
  if (product.catalog_price !== null && product.catalog_price !== undefined) {
    return Number(product.catalog_price);
  }
  return getBasePrice(product, quantity, priceTiers, suppliesCost);
};

export const getProductPriceTiers = (
  productId: string,
  priceTiers: PriceTier[] = [],
) =>
  priceTiers
    .filter((tier) => tier.product_id === productId)
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));

export const getMatchingPriceTier = (
  productId: string,
  quantity: number,
  priceTiers: PriceTier[] = [],
) => {
  const safeQuantity = Number(quantity) || 0;
  if (safeQuantity <= 0) return null;

  return (
    getProductPriceTiers(productId, priceTiers).find(
      (tier) =>
        safeQuantity >= Number(tier.min_quantity) &&
        (tier.max_quantity === null || safeQuantity <= Number(tier.max_quantity)),
    ) || null
  );
};

export const hasProductPriceTiers = (
  productId: string,
  priceTiers: PriceTier[] = [],
) => getProductPriceTiers(productId, priceTiers).length > 0;

export const getInitialTierQuantity = (
  productId: string,
  priceTiers: PriceTier[] = [],
) => {
  const firstTier = getProductPriceTiers(productId, priceTiers)[0];
  return firstTier ? Math.max(1, Number(firstTier.min_quantity) || 1) : 1;
};

export const isQuantityAllowedByPriceTiers = (
  productId: string,
  quantity: number,
  priceTiers: PriceTier[] = [],
) => {
  if (!hasProductPriceTiers(productId, priceTiers)) {
    return true;
  }

  return Boolean(getMatchingPriceTier(productId, quantity, priceTiers));
};

export const getPriceTierValidationMessage = (
  productId: string,
  priceTiers: PriceTier[] = [],
) => {
  const tiers = getProductPriceTiers(productId, priceTiers);
  if (tiers.length === 0) return null;

  const formatted = tiers
    .map((tier) =>
      tier.max_quantity === null
        ? `${tier.min_quantity}+`
        : `${tier.min_quantity} a ${tier.max_quantity}`,
    )
    .join(', ');

  return `Use uma quantidade dentro das faixas configuradas: ${formatted}.`;
};
