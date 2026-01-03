// Shared CAKTO helper used by Edge Functions
export type CaktoConfig = {
  apiKey?: string;
  clientId: string;
  clientSecret: string;
  apiBase: string;
  webhookSecret?: string | null;
};

const getConfig = (): CaktoConfig => {
  return {
    apiKey: Deno.env.get('CAKTO_API_KEY') ?? undefined,
    clientId: Deno.env.get('CAKTO_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('CAKTO_CLIENT_SECRET') ?? '',
    apiBase: Deno.env.get('CAKTO_API_BASE') ?? 'https://api.cakto.com.br',
    webhookSecret: Deno.env.get('CAKTO_WEBHOOK_SECRET') ?? null,
  };
};

let cachedToken: { token: string; expiresAt: number } | null = null;
let inflightToken: Promise<string> | null = null;

const getAccessToken = async (cfg: CaktoConfig) => {
  if (cfg.apiKey && (!cfg.clientId || !cfg.clientSecret)) {
    return cfg.apiKey;
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;
  if (inflightToken) return inflightToken;

  inflightToken = (async () => {
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('Missing CAKTO_CLIENT_ID or CAKTO_CLIENT_SECRET');
    }
    if (!cfg.apiBase) {
      throw new Error('Missing CAKTO_API_BASE');
    }

    const url = `${cfg.apiBase.replace(/\/$/, '')}/public_api/token/`;
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      inflightToken = null;
      throw new Error(`CAKTO auth failed: ${resp.status} ${text}`);
    }

    const tokenData = await resp.json().catch(() => null) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      inflightToken = null;
      throw new Error('CAKTO auth did not return access_token');
    }

    const expiresIn = Number(tokenData?.expires_in ?? 36000);
    cachedToken = {
      token: accessToken,
      expiresAt: now + Math.max(60, expiresIn - 120) * 1000,
    };
    inflightToken = null;
    return accessToken;
  })();

  return inflightToken;
};

const buildAuthHeader = async (cfg: CaktoConfig) => {
  const token = await getAccessToken(cfg);
  return `Bearer ${token}`;
};

export const createPlan = async (cfg: CaktoConfig, payload: Record<string, unknown>) => {
  const url = `${cfg.apiBase.replace(/\/$/, '')}/public_api/offers/`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: await buildAuthHeader(cfg),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`CAKTO create plan failed: ${resp.status} ${text}`);
  }
  return resp.json().catch(() => null);
};

export const listOffers = async (cfg: CaktoConfig, params?: Record<string, string>) => {
  const base = `${cfg.apiBase.replace(/\/$/, '')}/public_api/offers/`;
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const url = `${base}${query}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: await buildAuthHeader(cfg),
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`CAKTO list offers failed: ${resp.status} ${text}`);
  }
  return resp.json().catch(() => null);
};

export const createCustomer = async (cfg: CaktoConfig, payload: Record<string, unknown>) => {
  const url = `${cfg.apiBase.replace(/\/$/, '')}/public_api/customers/`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: await buildAuthHeader(cfg),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`CAKTO create customer failed: ${resp.status} ${text}`);
  }
  return resp.json().catch(() => null);
};

export const createSubscription = async (cfg: CaktoConfig, payload: Record<string, unknown>) => {
  const url = `${cfg.apiBase.replace(/\/$/, '')}/public_api/subscriptions/`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: await buildAuthHeader(cfg),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`CAKTO create subscription failed: ${resp.status} ${text}`);
  }
  return resp.json().catch(() => null);
};

export const verifyWebhookSignature = async (cfg: CaktoConfig, rawBody: string, signatureHeader?: string | null) => {
  const secret = cfg.webhookSecret;
  if (!secret) return true; // no secret configured, skip verification
  if (!signatureHeader) return false;
  try {
    const key = new TextEncoder().encode(secret);
    const data = new TextEncoder().encode(rawBody);
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    // signatureHeader may include prefix like sha256=
    const received = signatureHeader.replace(/^sha256=/i, '');
    return expected === received;
  } catch (e) {
    console.error('Webhook signature verify error', e);
    return false;
  }
};

export const getCaktoConfig = (): CaktoConfig => getConfig();
