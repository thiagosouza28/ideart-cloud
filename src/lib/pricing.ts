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

export const resolveSuggestedPrice = (
  product: Product,
  quantity: number,
  priceTiers: PriceTier[],
  suppliesCost = 0,
) => {
  const tiers = priceTiers.filter((tier) => tier.product_id === product.id);
  if (tiers.length > 0) {
    const tier = tiers.find(
      (t) =>
        quantity >= t.min_quantity &&
        (t.max_quantity === null || quantity <= t.max_quantity),
    );
    if (tier) return Number(tier.price);
  }

  if (product.final_price !== null && product.final_price !== undefined) {
    return Number(product.final_price);
  }

  return calculateSuggestedPrice(product, suppliesCost);
};
