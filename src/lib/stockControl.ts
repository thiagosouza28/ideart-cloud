import type { Product, StockControlType } from '@/types/database';

type StockControlLike = Pick<Partial<Product>, 'track_stock' | 'stock_control_type' | 'stock_quantity' | 'min_stock'>;

const isKnownStockControlType = (value: unknown): value is StockControlType =>
  value === 'none' || value === 'simple' || value === 'composition';

export const resolveStockControlType = (product: StockControlLike | null | undefined): StockControlType => {
  if (isKnownStockControlType(product?.stock_control_type)) {
    return product.stock_control_type;
  }

  return product?.track_stock ? 'simple' : 'none';
};

export const usesDirectProductStock = (product: StockControlLike | null | undefined) =>
  resolveStockControlType(product) === 'simple';

export const usesSupplyStock = (product: StockControlLike | null | undefined) =>
  resolveStockControlType(product) === 'composition';

export const hasStockControl = (product: StockControlLike | null | undefined) =>
  resolveStockControlType(product) !== 'none';

export const isLowDirectStock = (product: StockControlLike | null | undefined) =>
  usesDirectProductStock(product) &&
  Number(product?.stock_quantity || 0) <= Number(product?.min_stock || 0);
