import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
      requestHeaders ?? "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
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
    const response = await fetch("https://www.abibliadigital.com.br/api/verses/nvi/random");
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    return jsonResponse(corsHeaders, 200, data);
  } catch {
    return jsonResponse(corsHeaders, 200, {
      book: { name: "Joao", version: "nvi", author: "Joao" },
      chapter: 3,
      number: 16,
      text: "Porque Deus tanto amou o mundo que deu o seu Filho Unigenito, para que todo o que nele crer nao pereca, mas tenha a vida eterna.",
    });
  }
});
