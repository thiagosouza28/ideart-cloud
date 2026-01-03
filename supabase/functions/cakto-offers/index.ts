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
    return new URL(appUrl).origin;
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "GET") return jsonResponse(corsHeaders, 405, { error: "Invalid method" });

  try {
    const cfg = getCaktoConfig();
    if (!cfg.apiBase) {
      return jsonResponse(corsHeaders, 400, { error: "Missing CAKTO_API_BASE" });
    }

    const raw = await listOffers(cfg, { status: "active" });
    const offers = Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw)
        ? raw
        : [];

    const normalized = offers.map((offer: any) => ({
      id: offer?.id ?? offer?.short_id ?? offer?.offer_id ?? null,
      name: offer?.name ?? null,
      price: typeof offer?.price === "string" ? Number(offer.price) : offer?.price ?? null,
      intervalType: offer?.intervalType ?? offer?.interval_type ?? null,
      interval: offer?.interval ?? offer?.interval_count ?? null,
      status: offer?.status ?? null,
      type: offer?.type ?? null,
      checkout_url: offer?.checkoutUrl ?? offer?.checkout_url ?? offer?.salesPage ?? null,
    })).filter((offer: any) => !!offer.id);

    return jsonResponse(corsHeaders, 200, { offers: normalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
