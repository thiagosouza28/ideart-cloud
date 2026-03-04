import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCaktoConfig, listOffers } from "../_shared/cakto.ts";

export const config = { verify_jwt: false };

const defaultAllowedOrigins = [
  "http://192.168.0.221:8080",
  "http://localhost:8080",
];

const getAppOrigin = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  if (!appUrl) return null;
  try {
    const normalized = appUrl.startsWith("http://") || appUrl.startsWith("https://")
      ? appUrl
      : `https://${appUrl}`;
    return new URL(normalized).origin;
  } catch {
    return null;
  }
};

const allowedOrigins = new Set(
  [...defaultAllowedOrigins, getAppOrigin()].filter(Boolean) as string[],
);

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const requestHeaders = req.headers.get("access-control-request-headers");
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      requestHeaders ??
        "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const parseBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }
  return null;
};

const isEligibleOffer = (offer: {
  id: string | null;
  status: string | null;
  deleted: boolean;
  deleted_at: string | null;
}) => {
  if (!offer.id) return false;
  const normalizedStatus = offer.status?.trim().toLowerCase() || null;
  const isActive = !normalizedStatus || normalizedStatus === "active";
  const isDeleted = offer.deleted || !!offer.deleted_at || normalizedStatus === "deleted";
  return isActive && !isDeleted;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "GET") return jsonResponse(corsHeaders, 405, { error: "Método inválido" });

  try {
    const cfg = getCaktoConfig();
    if (!cfg.apiBase) {
      return jsonResponse(corsHeaders, 400, { error: "CAKTO_API_BASE ausente" });
    }

    const raw = await listOffers(cfg, { status: "active" });
    const offers = Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw)
        ? raw
        : [];

    const normalized = offers.map((offer: Record<string, unknown>) => {
      const rawId = offer?.id ?? offer?.short_id ?? offer?.offer_id ?? null;
      const id = rawId ? String(rawId) : null;
      const checkoutUrl =
        offer?.checkoutUrl ??
        offer?.checkout_url ??
        offer?.salesPage ??
        (id ? `https://pay.cakto.com.br/${id}` : null);
      const rawDeleted = offer?.deleted ?? offer?.is_deleted ?? offer?.isDeleted;
      const deleted = parseBooleanLike(rawDeleted) === true;
      const rawDeletedAt = offer?.deleted_at ?? offer?.deletedAt ?? null;
      const deletedAt = rawDeletedAt ? String(rawDeletedAt).trim() : null;
      const rawStatus = offer?.status ?? null;
      const status = rawStatus === null || rawStatus === undefined ? null : String(rawStatus);
      return ({
        id,
        name: offer?.name ?? null,
        price: typeof offer?.price === "string" ? Number(offer.price) : offer?.price ?? null,
        intervalType: offer?.intervalType ?? offer?.interval_type ?? null,
        interval: offer?.interval ?? offer?.interval_count ?? null,
        status,
        type: offer?.type ?? null,
        checkout_url: checkoutUrl,
        deleted,
        deleted_at: deletedAt,
      });
    }).filter(isEligibleOffer);

    return jsonResponse(corsHeaders, 200, { offers: normalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
