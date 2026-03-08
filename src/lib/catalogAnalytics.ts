import type { SupabaseClient } from "@supabase/supabase-js";

const VISITOR_KEY = "public-catalog-visitor-key";
const RECENTLY_VIEWED_PREFIX = "public-catalog-recently-viewed";

export type CatalogEventType =
  | "view_product"
  | "add_to_cart"
  | "start_order"
  | "purchase_completed";

export const getCatalogVisitorKey = () => {
  if (typeof window === "undefined") return "server";

  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;

  const nextKey = `visitor_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(VISITOR_KEY, nextKey);
  return nextKey;
};

const resolveRecentlyViewedKey = (companyId: string) => `${RECENTLY_VIEWED_PREFIX}:${companyId}`;

export const pushRecentlyViewedProduct = (companyId: string, productId: string) => {
  if (typeof window === "undefined" || !companyId || !productId) return;

  const storageKey = resolveRecentlyViewedKey(companyId);
  const current = window.localStorage.getItem(storageKey);
  const parsed = current ? (JSON.parse(current) as string[]) : [];
  const next = [productId, ...parsed.filter((id) => id !== productId)].slice(0, 12);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
};

export const getRecentlyViewedProducts = (companyId: string) => {
  if (typeof window === "undefined" || !companyId) return [] as string[];

  try {
    const raw = window.localStorage.getItem(resolveRecentlyViewedKey(companyId));
    return raw ? ((JSON.parse(raw) as string[]) || []) : [];
  } catch {
    return [];
  }
};

type TrackCatalogEventArgs = {
  client: SupabaseClient<any>;
  companyId: string;
  productId?: string | null;
  userId?: string | null;
  eventType: CatalogEventType;
  metadata?: Record<string, unknown>;
};

export const trackCatalogEvent = async ({
  client,
  companyId,
  productId = null,
  userId = null,
  eventType,
  metadata = {},
}: TrackCatalogEventArgs) => {
  if (!companyId) return;

  await client.from("catalog_event_logs").insert({
    company_id: companyId,
    product_id: productId,
    user_id: userId,
    session_key: getCatalogVisitorKey(),
    event_type: eventType,
    metadata,
  });
};

type TrackProductViewArgs = {
  client: SupabaseClient<any>;
  companyId: string;
  productId: string;
  userId?: string | null;
};

export const trackProductView = async ({
  client,
  companyId,
  productId,
  userId = null,
}: TrackProductViewArgs) => {
  if (!companyId || !productId) return;

  const sessionKey = getCatalogVisitorKey();
  const viewedAt = new Date().toISOString();

  await Promise.allSettled([
    client.from("product_view_history").insert({
      company_id: companyId,
      product_id: productId,
      user_id: userId,
      session_key: sessionKey,
      viewed_at: viewedAt,
    }),
    trackCatalogEvent({
      client,
      companyId,
      productId,
      userId,
      eventType: "view_product",
      metadata: { viewed_at: viewedAt },
    }),
  ]);
};
