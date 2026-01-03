export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return new Response("Missing SUPABASE_URL or SUPABASE_ANON_KEY", { status: 500 });
    }

    const body = await request.text();
    const resp = await fetch(`${supabaseUrl}/functions/v1/cakto-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      body,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") ?? "text/plain",
      },
    });
  },
};
