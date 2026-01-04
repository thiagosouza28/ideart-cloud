const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase URL ou ANON KEY não configuradas");
}

export async function invokePublicFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options?: { method?: "GET" | "POST" },
): Promise<T> {
  const method = options?.method ?? (body ? "POST" : "GET");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    console.error("Public function error:", {
      status: res.status,
      body: json ?? text,
    });
    throw new Error(json?.error || "Erro ao chamar funcao publica");
  }

  return json as T;
}
