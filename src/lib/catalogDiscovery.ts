import { isPromotionActive } from "@/lib/pricing";
import type { Product, ProductReview } from "@/types/database";

export type CatalogProductMetrics = {
  reviewCount: number;
  averageRating: number;
  rankingScore: number;
};

export const normalizeCatalogText = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const buildCatalogProductMetrics = (
  products: Product[],
  reviews: ProductReview[],
) => {
  const groupedReviews = new Map<string, ProductReview[]>();

  reviews.forEach((review) => {
    const bucket = groupedReviews.get(review.product_id) ?? [];
    bucket.push(review);
    groupedReviews.set(review.product_id, bucket);
  });

  return new Map<string, CatalogProductMetrics>(
    products.map((product) => {
      const productReviews = groupedReviews.get(product.id) ?? [];
      const reviewCount = productReviews.length;
      const averageRating =
        reviewCount > 0
          ? productReviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviewCount
          : 0;
      const salesCount = Number(product.sales_count || 0);
      const viewCount = Number(product.view_count || 0);
      const rankingScore = salesCount * 6 + viewCount * 1.5 + averageRating * 18 + reviewCount * 4;

      return [
        product.id,
        {
          reviewCount,
          averageRating: Math.round(averageRating * 10) / 10,
          rankingScore,
        },
      ];
    }),
  );
};

export const getProductBadgeLabels = (
  product: Product,
  metrics?: CatalogProductMetrics | null,
) => {
  const labels: Array<"Promocao" | "Mais vendido" | "Novo" | "Destaque"> = [];

  if (isPromotionActive(product)) labels.push("Promocao");
  if (Number(product.sales_count || 0) >= 5) labels.push("Mais vendido");

  const createdAt = product.created_at ? new Date(product.created_at) : null;
  if (createdAt) {
    const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation <= 30) labels.push("Novo");
  }

  if (product.catalog_featured || (metrics?.averageRating || 0) >= 4.5) labels.push("Destaque");

  return labels.slice(0, 3);
};

type SearchProductArgs = {
  product: Product;
  categoryName?: string | null;
  attributeTerms?: string[];
  term: string;
};

export const scoreCatalogSearchMatch = ({
  product,
  categoryName,
  attributeTerms = [],
  term,
}: SearchProductArgs) => {
  const normalizedTerm = normalizeCatalogText(term);
  if (!normalizedTerm) return 0;

  const name = normalizeCatalogText(product.name);
  const sku = normalizeCatalogText(product.sku);
  const description = normalizeCatalogText(product.catalog_short_description || product.description);
  const category = normalizeCatalogText(categoryName);
  const attributes = attributeTerms.map(normalizeCatalogText);
  const haystack = [name, sku, description, category, ...attributes].join(" ");

  if (!haystack.includes(normalizedTerm)) {
    const parts = normalizedTerm.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 0;
    const matchedParts = parts.filter((part) => haystack.includes(part));
    if (matchedParts.length === 0) return 0;
    return matchedParts.length * 18;
  }

  let score = 10;
  if (name.startsWith(normalizedTerm)) score += 120;
  else if (name.includes(normalizedTerm)) score += 90;
  if (sku && sku.includes(normalizedTerm)) score += 80;
  if (category && category.includes(normalizedTerm)) score += 50;
  if (description && description.includes(normalizedTerm)) score += 35;
  if (attributes.some((value) => value.includes(normalizedTerm))) score += 28;
  score += Math.min(24, Number(product.sales_count || 0));
  score += Math.min(20, Number(product.view_count || 0) / 2);

  return score;
};
