import type { PriceTier, Product } from '@/types/database';

type ProductPricing = Pick<
  Product,
  'base_cost' | 'labor_cost' | 'waste_percentage' | 'profit_margin' | 'final_price'
>;

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
  return costWithWaste * (1 + profitMargin / 100);
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
