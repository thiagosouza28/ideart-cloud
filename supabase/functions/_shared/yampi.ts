const YAMPI_BASE_URL = "https://api.dooki.com.br/v2";

export type YampiConfig = {
  alias: string;
  userSecretKey: string;
  userToken: string;
};

export type YampiPaymentLinkInput = {
  name: string;
  active?: boolean;
  skus: Array<{ id: number; quantity: number }>;
  promocode_id?: number | null;
  customer_id?: number | null;
  customer_address_id?: number | null;
};

export type YampiPaymentLinkResponse = {
  id: number;
  link_url: string;
  name: string;
  whatsapp?: {
    message: string;
    link: string;
  };
};

export type YampiSubscriptionProductInput = {
  name: string;
  description?: string | null;
  price: number;
  periodDays: number;
  active?: boolean;
};

export type YampiSubscriptionProductResult = {
  productId: string;
  checkoutUrl: string | null;
  skuId: string | null;
  raw: unknown;
};

const normalizeAlias = (value?: string | null) => (value || "").trim();
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
};

const mapPeriodDays = (days: number) => {
  if (days >= 365) {
    return { interval: "year", intervalCount: Math.max(1, Math.round(days / 365)) };
  }
  return { interval: "month", intervalCount: Math.max(1, Math.round(days / 30)) };
};

export const getYampiConfig = (): YampiConfig => {
  const alias = normalizeAlias(Deno.env.get("YAMPI_ALIAS"));
  const userSecretKey = normalizeAlias(Deno.env.get("YAMPI_USER_SECRET_KEY"));
  const userToken = normalizeAlias(Deno.env.get("YAMPI_USER_TOKEN"));

  if (!alias) {
    throw new Error("YAMPI_ALIAS is not set");
  }
  if (!userSecretKey) {
    throw new Error("YAMPI_USER_SECRET_KEY is not set");
  }
  if (!userToken) {
    throw new Error("YAMPI_USER_TOKEN is not set");
  }

  return { alias, userSecretKey, userToken };
};

const buildHeaders = (config: YampiConfig) => ({
  "Content-Type": "application/json",
  "User-Secret-Key": config.userSecretKey,
  "User-Token": config.userToken,
});

const toJson = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const yampiRequest = async <T>(
  config: YampiConfig,
  path: string,
  options: RequestInit,
  attempt = 0,
): Promise<T> => {
  const url = `${YAMPI_BASE_URL}/${config.alias}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...buildHeaders(config),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const payload = await toJson(response);

    if (!response.ok) {
      if (response.status >= 500 && attempt < DEFAULT_RETRIES) {
        await delay(500);
        return yampiRequest<T>(config, path, options, attempt + 1);
      }
      const message =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload || {});
      throw new Error(
        `Yampi API error (${response.status}): ${message}`,
      );
    }

    return payload as T;
  } catch (error) {
    const isAbort =
      error instanceof DOMException && error.name === "AbortError";
    if (isAbort && attempt < DEFAULT_RETRIES) {
      await delay(500);
      return yampiRequest<T>(config, path, options, attempt + 1);
    }
    if (isAbort) {
      throw new Error("Yampi API request timed out");
    }
    if (attempt < DEFAULT_RETRIES) {
      await delay(500);
      return yampiRequest<T>(config, path, options, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const createPaymentLink = async (
  config: YampiConfig,
  input: YampiPaymentLinkInput,
): Promise<YampiPaymentLinkResponse> =>
  yampiRequest<YampiPaymentLinkResponse>(config, "/checkout/payment-link", {
    method: "POST",
    body: JSON.stringify({
      active: true,
      ...input,
    }),
  });

export const createSubscriptionProduct = async (
  config: YampiConfig,
  input: YampiSubscriptionProductInput,
): Promise<YampiSubscriptionProductResult> => {
  const { interval, intervalCount } = mapPeriodDays(input.periodDays);

  const payload = {
    name: input.name,
    description: input.description ?? null,
    price: input.price,
    active: input.active ?? true,
    type: "subscription",
    period_days: input.periodDays,
    recurring: {
      interval,
      interval_count: intervalCount,
    },
  };

  const response = await yampiRequest<unknown>(config, "/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const record = asRecord(response);
  const data = asRecord(record?.data) ?? record;
  const productId = pickFirstString(
    data?.id,
    data?.product_id,
    record?.id,
    record?.product_id,
  );
  const checkoutUrl = pickFirstString(
    data?.checkout_url,
    data?.link_url,
    data?.url,
    record?.checkout_url,
    record?.link_url,
    record?.url,
  );
  const skuId = pickFirstString(
    data?.sku_id,
    data?.skuId,
    (data?.sku as Record<string, unknown> | null)?.id,
    (data?.default_sku as Record<string, unknown> | null)?.id,
    (data?.skus as Array<Record<string, unknown>> | undefined)?.[0]?.id,
  );

  if (!productId) {
    throw new Error("Yampi product id not returned");
  }

  return {
    productId,
    checkoutUrl,
    skuId,
    raw: response,
  };
};

export const computeWebhookSignature = async (
  secret: string,
  body: string,
) => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const message = encoder.encode(body);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  const bytes = new Uint8Array(signature);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

export const buildWebhookEventId = async (payload: unknown, body: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
