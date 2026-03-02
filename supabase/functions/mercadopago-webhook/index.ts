/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const getSupabaseClient = () =>
  createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const jsonResponse = (headers: Record<string, string>, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const constantTimeEquals = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

const hexEncode = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const validateSignature = async (rawBody: string, signatureHeader: string | null, secret: string | null) => {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const v1Part = parts.find((part) => part.startsWith("v1="));
  const provided = normalizeText(v1Part ? v1Part.slice(3) : signatureHeader);
  if (!provided) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = hexEncode(new Uint8Array(signature));

  return constantTimeEquals(expected, provided.toLowerCase());
};

const fetchMercadoPagoPayment = async (paymentId: string, token: string) => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Falha ao consultar pagamento MercadoPago: ${data?.message || response.status}`,
    );
  }
  return data as Record<string, any>;
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

  const supabase = getSupabaseClient();
  const signatureSecret = normalizeText(Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET"));

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-signature");
  const signatureValid = await validateSignature(rawBody, signatureHeader, signatureSecret);

  if (signatureSecret && !signatureValid) {
    return jsonResponse(corsHeaders, 401, { error: "Assinatura invalida" });
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};
  const eventType =
    normalizeText(payload?.action) || normalizeText(payload?.type) || normalizeText(payload?.topic);
  const paymentId =
    normalizeText(payload?.data?.id) || normalizeText(payload?.id) || normalizeText(payload?.resource_id);
  const externalEventId =
    normalizeText(payload?.id) || normalizeText(req.headers.get("x-request-id"));

  let order = null as null | {
    id: string;
    company_id: string;
    total: number;
    payment_id: string | null;
    order_number: number;
  };

  if (paymentId) {
    const { data } = await supabase
      .from("orders")
      .select("id, company_id, total, payment_id, order_number")
      .eq("payment_id", paymentId)
      .maybeSingle();

    order = (data as typeof order) ?? null;
  }

  const referenceId = normalizeText(payload?.external_reference);
  if (!order && referenceId) {
    const { data } = await supabase
      .from("orders")
      .select("id, company_id, total, payment_id, order_number")
      .eq("id", referenceId)
      .maybeSingle();

    order = (data as typeof order) ?? null;
  }

  if (!order || !order.company_id) {
    return jsonResponse(corsHeaders, 202, {
      ok: true,
      ignored: true,
      reason: "pedido nao localizado",
    });
  }

  let paymentStatus = normalizeText(payload?.status);
  let paidAt = normalizeText(payload?.date_approved);
  let gatewayTransactionId = paymentId || order.payment_id || null;
  let gatewayOrderId = referenceId;
  let paymentDetails: Record<string, unknown> | null = null;

  try {
    const { data: tokenData } = await supabase
      .from("company_payment_tokens")
      .select("mp_access_token")
      .eq("company_id", order.company_id)
      .maybeSingle();

    const mpToken = normalizeText(tokenData?.mp_access_token);
    if (mpToken && gatewayTransactionId) {
      const details = await fetchMercadoPagoPayment(gatewayTransactionId, mpToken);
      paymentDetails = details;
      paymentStatus = normalizeText(details?.status) || paymentStatus;
      paidAt = normalizeText(details?.date_approved) || paidAt;
      gatewayOrderId =
        normalizeText(details?.external_reference) ||
        normalizeText(details?.order?.id) ||
        gatewayOrderId;
      gatewayTransactionId =
        normalizeText(details?.id) || gatewayTransactionId;
    }
  } catch (error) {
    console.warn("mercadopago-webhook detail fetch failed", error);
  }

  const isPaid = paymentStatus === "approved";

  let errorMessage: string | null = null;

  if (isPaid) {
    const resolvedPaidAt = paidAt || new Date().toISOString();
    const paidAmountCandidate = toNumber(
      (paymentDetails as any)?.transaction_amount ??
        (paymentDetails as any)?.transaction_details?.total_paid_amount ??
        payload?.transaction_amount,
      Number(order.total || 0),
    );
    let settledAmount = paidAmountCandidate > 0 ? paidAmountCandidate : Number(order.total || 0);
    let wasAlreadySettled = false;

    let existingPaidQuery = supabase
      .from("order_payments")
      .select("id, amount")
      .eq("order_id", order.id)
      .eq("status", "pago")
      .eq("method", "pix");

    existingPaidQuery = gatewayTransactionId
      ? existingPaidQuery.eq("gateway_transaction_id", gatewayTransactionId)
      : existingPaidQuery.is("gateway_transaction_id", null);

    const { data: existingPaid, error: existingPaidError } = await existingPaidQuery
      .limit(1)
      .maybeSingle();

    if (existingPaidError) {
      errorMessage = existingPaidError.message;
    } else if (existingPaid) {
      wasAlreadySettled = true;
      settledAmount = toNumber(existingPaid.amount, settledAmount);
    } else {
      let pendingPayment: { id: string; amount: number } | null = null;
      let pendingPaymentError: { message?: string } | null = null;

      if (gatewayTransactionId) {
        const { data: byGatewayId, error: byGatewayIdError } = await supabase
          .from("order_payments")
          .select("id, amount")
          .eq("order_id", order.id)
          .eq("status", "pendente")
          .eq("method", "pix")
          .eq("gateway_transaction_id", gatewayTransactionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        pendingPayment = byGatewayId as typeof pendingPayment;
        pendingPaymentError = (byGatewayIdError as typeof pendingPaymentError) ?? null;
      }

      if (!pendingPayment && !pendingPaymentError) {
        const { data: withoutGatewayId, error: withoutGatewayIdError } = await supabase
          .from("order_payments")
          .select("id, amount")
          .eq("order_id", order.id)
          .eq("status", "pendente")
          .eq("method", "pix")
          .is("gateway_transaction_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        pendingPayment = withoutGatewayId as typeof pendingPayment;
        pendingPaymentError = (withoutGatewayIdError as typeof pendingPaymentError) ?? null;
      }

      if (pendingPaymentError) {
        errorMessage = pendingPaymentError.message;
      } else if (pendingPayment?.id) {
        settledAmount = toNumber(pendingPayment.amount, settledAmount);

        const { error: updatePaymentError } = await supabase
          .from("order_payments")
          .update({
            amount: settledAmount,
            status: "pago",
            paid_at: resolvedPaidAt,
            gateway: "MercadoPago",
            gateway_order_id: gatewayOrderId,
            gateway_transaction_id: gatewayTransactionId,
            raw_payload: paymentDetails || payload,
            notes: "Pagamento confirmado via webhook MercadoPago",
          })
          .eq("id", pendingPayment.id);

        if (updatePaymentError) {
          errorMessage = updatePaymentError.message;
        }
      } else {
        const { error: insertPaymentError } = await supabase
          .from("order_payments")
          .insert({
            order_id: order.id,
            company_id: order.company_id,
            amount: settledAmount,
            status: "pago",
            method: "pix",
            paid_at: resolvedPaidAt,
            gateway: "MercadoPago",
            gateway_order_id: gatewayOrderId,
            gateway_transaction_id: gatewayTransactionId,
            raw_payload: paymentDetails || payload,
            notes: "Pagamento confirmado via webhook MercadoPago",
          });

        if (insertPaymentError) {
          errorMessage = insertPaymentError.message;
        }
      }
    }

    if (!errorMessage) {
      const { data: paymentRows, error: paymentRowsError } = await supabase
        .from("order_payments")
        .select("amount, status, paid_at")
        .eq("order_id", order.id);

      if (paymentRowsError) {
        errorMessage = paymentRowsError.message;
      } else {
        const paidRows = (paymentRows || []).filter((row) => row.status !== "pendente");
        const paidTotal = paidRows.reduce(
          (sum, row) => sum + toNumber(row.amount, 0),
          0,
        );
        const orderTotal = toNumber(order.total, 0);
        const nextPaymentStatus =
          paidTotal >= orderTotal ? "pago" : paidTotal > 0 ? "parcial" : "pendente";
        const latestPaidAt = paidRows
          .map((row) => normalizeText(row.paid_at))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) || resolvedPaidAt;

        const { error: updateOrderError } = await supabase
          .from("orders")
          .update({
            payment_status: nextPaymentStatus,
            payment_method: "pix",
            amount_paid: paidTotal,
            paid_at: nextPaymentStatus === "pendente" ? null : latestPaidAt,
            payment_id: gatewayTransactionId || order.payment_id,
            gateway: "MercadoPago",
            gateway_order_id: gatewayOrderId,
          })
          .eq("id", order.id);

        if (updateOrderError) {
          errorMessage = updateOrderError.message;
        } else if (!wasAlreadySettled) {
          await supabase.from("order_notifications").insert({
            company_id: order.company_id,
            order_id: order.id,
            type: "payment",
            title: `Pagamento confirmado - Pedido #${order.order_number}`,
            body: "Pagamento PIX confirmado automaticamente pelo gateway.",
          });
        }
      }
    }
  }

  await supabase.from("payment_webhook_logs").insert({
    company_id: order.company_id,
    order_id: order.id,
    gateway: "MercadoPago",
    event_type: eventType,
    external_event_id: externalEventId,
    payment_id: gatewayTransactionId || order.payment_id,
    status: paymentStatus,
    payload,
    signature_valid: signatureValid,
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
  });

  if (errorMessage) {
    return jsonResponse(corsHeaders, 500, { ok: false, error: errorMessage });
  }

  return jsonResponse(corsHeaders, 200, { ok: true });
});
