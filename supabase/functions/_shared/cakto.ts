// Shared CAKTO helper used by Edge Functions
export type CaktoConfig = {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  webhookSecret?: string | null;
};

const tokenCache: { token?: string; expiresAt?: number } = {};

const getConfig = (): CaktoConfig => {
  return {
    clientId: Deno.env.get('CAKTO_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('CAKTO_CLIENT_SECRET') ?? '',
    apiBase: Deno.env.get('CAKTO_API_BASE') ?? '',
    webhookSecret: Deno.env.get('CAKTO_WEBHOOK_SECRET') ?? null,
  };
};

const fetchToken = async (cfg: CaktoConfig) => {
  const tokenUrl = `${cfg.apiBase.replace(/\/$/, '')}/oauth/token`;
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Token request failed: ${resp.status}`);
  const data = await resp.json().catch(() => ({}));
  const token = (data && data.access_token) || '';
  const expiresIn = Number(data?.expires_in) || 3600;
  tokenCache.token = token;
  tokenCache.expiresAt = Date.now() + expiresIn * 1000 - 60_000;
  return token;
};

const getToken = async (cfg: CaktoConfig) => {
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  return fetchToken(cfg);
};

export const createPlan = async (cfg: CaktoConfig, payload: Record<string, unknown>) => {
  const token = await getToken(cfg);
  const url = `${cfg.apiBase.replace(/\/$/, '')}/v1/plans`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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

export const createCustomer = async (cfg: CaktoConfig, payload: Record<string, unknown>) => {
  const token = await getToken(cfg);
  const url = `${cfg.apiBase.replace(/\/$/, '')}/v1/customers`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
  const token = await getToken(cfg);
  const url = `${cfg.apiBase.replace(/\/$/, '')}/v1/subscriptions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
