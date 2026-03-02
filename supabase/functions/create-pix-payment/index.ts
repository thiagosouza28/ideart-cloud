/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const jsonResponse = (headers: Record<string, string>, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const getSupabaseClient = () =>
  createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const quickQrUrl = (text: string) =>
  `https://quickchart.io/qr?size=300&text=${encodeURIComponent(text)}`;

const toFixedAmount = (value: number) => Number(value.toFixed(2));

const buildFunctionWebhookUrl = (functionName: string) => {
  const base = SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/functions/v1/${functionName}`;
};

const MERCADOPAGO_WEBHOOK_URL =
  normalizeText(Deno.env.get("MERCADOPAGO_WEBHOOK_URL")) ||
  buildFunctionWebhookUrl("mercadopago-webhook");

const PAGSEGURO_WEBHOOK_URL =
  normalizeText(Deno.env.get("PAGSEGURO_WEBHOOK_URL")) ||
  buildFunctionWebhookUrl("pagseguro-webhook");

const toTlv = (id: string, value: string) =>
  `${id}${value.length.toString().padStart(2, "0")}${value}`;

const crc16Ccitt = (payload: string) => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const normalizePixMerchantField = (value: unknown, fallback: string, maxLength: number) => {
  const raw = normalizeText(value) || fallback;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
};

const buildManualPixBrCode = (params: {
  pixKey: string;
  amount: number;
  beneficiaryName: string;
  city: string;
  txid: string;
  description?: string | null;
}) => {
  const key = normalizeText(params.pixKey);
  if (!key) {
    throw new Error("Chave PIX manual nao configurada");
  }

  const description = normalizeText(params.description)?.slice(0, 72) || null;
  const merchantAccountInfo =
    toTlv("00", "BR.GOV.BCB.PIX") +
    toTlv("01", key) +
    (description ? toTlv("02", description) : "");

  const txidRaw = normalizeText(params.txid) || "***";
  const txid = txidRaw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 25) || "***";

  const payloadWithoutCrc =
    toTlv("00", "01") +
    toTlv("26", merchantAccountInfo) +
    toTlv("52", "0000") +
    toTlv("53", "986") +
    toTlv("54", params.amount.toFixed(2)) +
    toTlv("58", "BR") +
    toTlv("59", normalizePixMerchantField(params.beneficiaryName, "LOJA", 25)) +
    toTlv("60", normalizePixMerchantField(params.city, "CIDADE", 15)) +
    toTlv("62", toTlv("05", txid)) +
    "6304";

  const crc = crc16Ccitt(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
};

const parseJson = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  return text ? { raw: text } : {};
};

type CreatePixPaymentPayload = {
  company_id?: string;
  order_id?: string;
  public_token?: string;
};

type PixChargeResult = {
  paymentId: string;
  qrCode: string | null;
  copyPaste: string;
  rawPayload: Record<string, unknown> | null;
  gatewayOrderId?: string | null;
  gatewayTransactionId?: string | null;
};

const createManualPixCharge = (
  order: { id: string; order_number: number; total: number },
  company: {
    pix_key: string | null;
    pix_key_type: string | null;
    pix_beneficiary_name: string | null;
    city?: string | null;
  },
): PixChargeResult => {
  const amount = toFixedAmount(Number(order.total));
  const txid = `PED${String(order.order_number)}${order.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`.slice(0, 25);
  const copyPaste = buildManualPixBrCode({
    pixKey: company.pix_key || "",
    amount,
    beneficiaryName: company.pix_beneficiary_name || "Loja",
    city: company.city || "Cidade",
    txid,
    description: `Pedido ${order.order_number}`,
  });

  return {
    paymentId: `manual-${order.id.replace(/-/g, "").slice(0, 10)}-${Date.now()}`,
    qrCode: quickQrUrl(copyPaste),
    copyPaste,
    rawPayload: {
      provider: "PixManual",
      amount,
      order_number: order.order_number,
    },
  };
};

const createMercadoPagoCharge = async (
  payload: {
    amount: number;
    orderId: string;
    orderNumber: number;
    companyId: string;
    customerEmail: string;
  },
  token: string,
): Promise<PixChargeResult> => {
  const body = {
    transaction_amount: payload.amount,
    description: `Pedido #${payload.orderNumber}`,
    payment_method_id: "pix",
    payer: { email: payload.customerEmail },
    external_reference: payload.orderId,
    metadata: {
      company_id: payload.companyId,
      order_id: payload.orderId,
    },
    notification_url: MERCADOPAGO_WEBHOOK_URL || undefined,
  };

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const data = (await parseJson(response)) as Record<string, any>;

  if (!response.ok) {
    throw new Error(
      `Falha ao criar cobranca PIX no MercadoPago: ${data?.message || response.status}`,
    );
  }

  const txData = data?.point_of_interaction?.transaction_data || {};
  const copyPaste =
    normalizeText(txData?.qr_code) ||
    normalizeText(data?.qr_code) ||
    normalizeText(data?.point_of_interaction?.qr_code) ||
    "";

  if (!copyPaste) {
    throw new Error("MercadoPago nao retornou codigo PIX copia e cola");
  }

  const base64Qr = normalizeText(txData?.qr_code_base64);
  const ticketUrl = normalizeText(txData?.ticket_url);

  return {
    paymentId: String(data?.id || crypto.randomUUID()),
    qrCode: base64Qr ? `data:image/png;base64,${base64Qr}` : ticketUrl || quickQrUrl(copyPaste),
    copyPaste,
    rawPayload: data,
    gatewayOrderId: normalizeText(data?.order?.id) || normalizeText(data?.id),
    gatewayTransactionId: normalizeText(txData?.transaction_id) || normalizeText(data?.id),
  };
};

const createPagSeguroCharge = async (
  payload: {
    amount: number;
    orderId: string;
    orderNumber: number;
    customerName: string;
    customerEmail: string;
    customerDocument: string | null;
  },
  token: string,
): Promise<PixChargeResult> => {
  const amountStr = payload.amount.toFixed(2);
  const requestBody: Record<string, unknown> = {
    reference_id: payload.orderId,
    customer: {
      name: payload.customerName.slice(0, 80),
      email: payload.customerEmail,
      tax_id: payload.customerDocument || undefined,
    },
    items: [
      {
        reference_id: payload.orderId,
        name: `Pedido #${payload.orderNumber}`,
        quantity: 1,
        unit_amount: Math.round(payload.amount * 100),
      },
    ],
    qr_codes: [
      {
        amount: {
          value: amountStr,
        },
      },
    ],
  };

  const webhookUrl = PAGSEGURO_WEBHOOK_URL;
  if (webhookUrl) {
    requestBody.notification_urls = [webhookUrl];
  }

  const response = await fetch("https://api.pagseguro.com/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await parseJson(response)) as Record<string, any>;

  if (!response.ok) {
    throw new Error(
      `Falha ao criar cobranca PIX no PagSeguro: ${data?.error_messages?.[0]?.description || data?.message || response.status}`,
    );
  }

  const qrCodeNode = data?.qr_codes?.[0] || data?.charges?.[0]?.payment_response || {};
  const copyPaste =
    normalizeText(qrCodeNode?.text) ||
    normalizeText(qrCodeNode?.payload) ||
    normalizeText(qrCodeNode?.emv) ||
    normalizeText(data?.charges?.[0]?.payment_response?.code) ||
    "";

  if (!copyPaste) {
    throw new Error("PagSeguro nao retornou codigo PIX copia e cola");
  }

  const qrImage = normalizeText(qrCodeNode?.links?.[0]?.href);
  const paymentId =
    normalizeText(data?.charges?.[0]?.id) || normalizeText(data?.id) || crypto.randomUUID();

  return {
    paymentId,
    qrCode: qrImage || quickQrUrl(copyPaste),
    copyPaste,
    rawPayload: data,
    gatewayOrderId: normalizeText(data?.id),
    gatewayTransactionId: normalizeText(data?.charges?.[0]?.id),
  };
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Metodo invalido" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as CreatePixPaymentPayload;
    const publicToken = normalizeText(body.public_token);
    const orderId = normalizeText(body.order_id);
    const companyId = normalizeText(body.company_id);

    if (!publicToken) {
      return jsonResponse(corsHeaders, 400, {
        error: "public_token obrigatorio para gerar cobranca PIX",
      });
    }

    const supabase = getSupabaseClient();

    const { data: linkData, error: linkError } = await supabase
      .from("order_public_links")
      .select("order_id, token")
      .eq("token", publicToken)
      .maybeSingle();

    if (linkError || !linkData?.order_id) {
      return jsonResponse(corsHeaders, 404, { error: "Pedido publico nao encontrado" });
    }

    if (orderId && orderId !== linkData.order_id) {
      return jsonResponse(corsHeaders, 403, { error: "Token nao pertence ao pedido informado" });
    }

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, order_number, company_id, customer_id, total, amount_paid, payment_status, payment_method, gateway",
      )
      .eq("id", linkData.order_id)
      .maybeSingle();

    if (orderError || !orderData) {
      return jsonResponse(corsHeaders, 404, { error: "Pedido nao encontrado" });
    }

    if (!orderData.company_id) {
      return jsonResponse(corsHeaders, 400, { error: "Pedido sem empresa vinculada" });
    }

    if (companyId && companyId !== orderData.company_id) {
      return jsonResponse(corsHeaders, 403, { error: "Pedido nao pertence a empresa informada" });
    }

    const { data: optionsData, error: optionsError } = await supabase.rpc(
      "get_company_checkout_payment_options",
      {
        p_company_id: orderData.company_id,
      },
    );

    if (optionsError) {
      return jsonResponse(corsHeaders, 400, { error: optionsError.message });
    }

    const pixAvailable = Boolean((optionsData as any)?.pix_available);
    const pixGateway = normalizeText((optionsData as any)?.pix_gateway);

    if (!pixAvailable || !pixGateway) {
      return jsonResponse(corsHeaders, 403, {
        error: "PIX indisponivel para esta loja",
      });
    }

    const total = Number(orderData.total || 0);
    const amountPaid = Number(orderData.amount_paid || 0);
    const remaining = toFixedAmount(Math.max(0, total - amountPaid));

    if (remaining <= 0) {
      return jsonResponse(corsHeaders, 400, {
        error: "Pedido ja esta totalmente pago",
      });
    }

    const [{ data: companyData, error: companyError }, { data: tokenData }, { data: customerData }] =
      await Promise.all([
        supabase
      .from("companies")
      .select("id, pix_gateway, pix_key, pix_key_type, pix_beneficiary_name, city")
      .eq("id", orderData.company_id)
      .maybeSingle(),
        supabase
          .from("company_payment_tokens")
          .select("mp_access_token, pagseguro_token")
          .eq("company_id", orderData.company_id)
          .maybeSingle(),
        orderData.customer_id
          ? supabase
              .from("customers")
              .select("name, email, document")
              .eq("id", orderData.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as { data: null }),
      ]);

    if (companyError || !companyData) {
      return jsonResponse(corsHeaders, 400, {
        error: companyError?.message || "Empresa nao encontrada",
      });
    }

    const customerEmail =
      normalizeText(customerData?.email) ||
      `pedido-${orderData.order_number}@cliente.local`;
    const customerName = normalizeText(customerData?.name) || `Cliente ${orderData.order_number}`;
    const customerDocument = normalizeText(customerData?.document);

    let charge: PixChargeResult;

    if (pixGateway === "PixManual") {
      charge = createManualPixCharge(
        {
          id: orderData.id,
          order_number: orderData.order_number,
          total: remaining,
        },
        {
          pix_key: companyData.pix_key,
          pix_key_type: companyData.pix_key_type,
          pix_beneficiary_name: companyData.pix_beneficiary_name,
          city: companyData.city,
        },
      );
    } else if (pixGateway === "MercadoPago") {
      const mpToken = normalizeText(tokenData?.mp_access_token);
      if (!mpToken) {
        return jsonResponse(corsHeaders, 403, {
          error: "Token MercadoPago nao configurado",
        });
      }

      charge = await createMercadoPagoCharge(
        {
          amount: remaining,
          orderId: orderData.id,
          orderNumber: orderData.order_number,
          companyId: orderData.company_id,
          customerEmail,
        },
        mpToken,
      );
    } else if (pixGateway === "PagSeguro") {
      const pagSeguroToken = normalizeText(tokenData?.pagseguro_token);
      if (!pagSeguroToken) {
        return jsonResponse(corsHeaders, 403, {
          error: "Token PagSeguro nao configurado",
        });
      }

      charge = await createPagSeguroCharge(
        {
          amount: remaining,
          orderId: orderData.id,
          orderNumber: orderData.order_number,
          customerName,
          customerEmail,
          customerDocument,
        },
        pagSeguroToken,
      );
    } else {
      return jsonResponse(corsHeaders, 403, { error: "Gateway PIX invalido" });
    }

    const paidAt = null;

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        payment_method: "pix",
        payment_status: "pendente",
        gateway: pixGateway,
        payment_id: charge.paymentId,
        payment_qr_code: charge.qrCode,
        payment_copy_paste: charge.copyPaste,
        paid_at: paidAt,
      })
      .eq("id", orderData.id);

    if (updateOrderError) {
      return jsonResponse(corsHeaders, 400, { error: updateOrderError.message });
    }

    await supabase
      .from("order_payments")
      .delete()
      .eq("order_id", orderData.id)
      .eq("status", "pendente")
      .eq("method", "pix");

    const { error: insertPaymentError } = await supabase
      .from("order_payments")
      .insert({
        order_id: orderData.id,
        company_id: orderData.company_id,
        amount: remaining,
        status: "pendente",
        method: "pix",
        gateway: pixGateway,
        gateway_order_id: charge.gatewayOrderId || charge.paymentId,
        gateway_transaction_id: charge.gatewayTransactionId || charge.paymentId,
        raw_payload: charge.rawPayload,
        notes: "Cobranca PIX gerada",
      });

    if (insertPaymentError) {
      return jsonResponse(corsHeaders, 400, { error: insertPaymentError.message });
    }

    return jsonResponse(corsHeaders, 200, {
      order_id: orderData.id,
      order_number: orderData.order_number,
      amount: remaining,
      gateway: pixGateway,
      payment_status: "pendente",
      payment_id: charge.paymentId,
      payment_qr_code: charge.qrCode,
      payment_copy_paste: charge.copyPaste,
      public_token: publicToken,
      public_order_url: `/pedido/${publicToken}`,
    });
  } catch (error) {
    console.error("create-pix-payment error:", error);
    return jsonResponse(corsHeaders, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
