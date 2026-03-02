/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const PAID_STATUSES = new Set(["PAID", "PAID_OUT", "COMPLETED", "AUTHORIZED"]);

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

const normalizeAmount = (value: unknown, orderTotal: number) => {
  const amount = toNumber(value, orderTotal);
  if (!Number.isFinite(amount) || amount <= 0) return orderTotal;
  if (orderTotal > 0 && amount > orderTotal * 100 && Number.isInteger(amount)) {
    return amount / 100;
  }
  return amount;
};

const normalizeSignatureValue = (signatureHeader: string | null) => {
  const raw = normalizeText(signatureHeader);
  if (!raw) return null;

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const candidate = parts[0] || raw;
  const value = candidate.includes("=") ? candidate.split("=").at(-1) : candidate;
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
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
  const providedSignature = normalizeSignatureValue(signatureHeader);
  if (!providedSignature) return false;

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
  return constantTimeEquals(expected, providedSignature);
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
  const signatureSecret = normalizeText(Deno.env.get("PAGSEGURO_WEBHOOK_SECRET"));

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-signature") || req.headers.get("x-pagseguro-signature");
  const signatureValid = await validateSignature(rawBody, signatureHeader, signatureSecret);

  if (signatureSecret && !signatureValid) {
    return jsonResponse(corsHeaders, 401, { error: "Assinatura invalida" });
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};

  const eventType =
    normalizeText(payload?.type) ||
    normalizeText(payload?.event) ||
    normalizeText(payload?.notification_type);

  const referenceId =
    normalizeText(payload?.reference_id) ||
    normalizeText(payload?.data?.reference_id) ||
    normalizeText(payload?.charges?.[0]?.reference_id) ||
    normalizeText(payload?.order?.id);

  const paymentId =
    normalizeText(payload?.charges?.[0]?.id) ||
    normalizeText(payload?.payment_id) ||
    normalizeText(payload?.id) ||
    normalizeText(payload?.data?.id);

  const paymentStatus =
    (normalizeText(payload?.charges?.[0]?.status) ||
      normalizeText(payload?.status) ||
      normalizeText(payload?.data?.status) ||
      "")
      .toUpperCase();

  const paidAt =
    normalizeText(payload?.charges?.[0]?.paid_at) ||
    normalizeText(payload?.paid_at) ||
    normalizeText(payload?.data?.paid_at) ||
    null;

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

  if (!order && referenceId) {
    const { data } = await supabase
      .from("orders")
      .select("id, company_id, total, payment_id, order_number")
      .eq("id", referenceId)
      .maybeSingle();
    order = (data as typeof order) ?? null;
  }

  if (!order && paymentId) {
    const { data: paymentRow } = await supabase
      .from("order_payments")
      .select("order_id")
      .eq("gateway_transaction_id", paymentId)
      .maybeSingle();

    if (paymentRow?.order_id) {
      const { data } = await supabase
        .from("orders")
        .select("id, company_id, total, payment_id, order_number")
        .eq("id", paymentRow.order_id)
        .maybeSingle();
      order = (data as typeof order) ?? null;
    }
  }

  if (!order || !order.company_id) {
    return jsonResponse(corsHeaders, 202, {
      ok: true,
      ignored: true,
      reason: "pedido nao localizado",
    });
  }

  const isPaid = PAID_STATUSES.has(paymentStatus);
  const resolvedPaidAt = paidAt || new Date().toISOString();

  let errorMessage: string | null = null;

  if (isPaid) {
    const paidAmountCandidate = normalizeAmount(
      payload?.charges?.[0]?.amount?.value ??
        payload?.charges?.[0]?.paid_amount?.value ??
        payload?.amount?.value ??
        payload?.data?.amount?.value ??
        payload?.charges?.[0]?.amount,
      Number(order.total || 0),
    );
    let settledAmount =
      paidAmountCandidate > 0 ? paidAmountCandidate : Number(order.total || 0);
    let wasAlreadySettled = false;

    let existingPaidQuery = supabase
      .from("order_payments")
      .select("id, amount")
      .eq("order_id", order.id)
      .eq("status", "pago")
      .eq("method", "pix");

    existingPaidQuery = paymentId
      ? existingPaidQuery.eq("gateway_transaction_id", paymentId)
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

      if (paymentId) {
        const { data: byGatewayId, error: byGatewayIdError } = await supabase
          .from("order_payments")
          .select("id, amount")
          .eq("order_id", order.id)
          .eq("status", "pendente")
          .eq("method", "pix")
          .eq("gateway_transaction_id", paymentId)
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
        errorMessage = pendingPaymentError.message || "Falha ao localizar pagamento pendente";
      } else if (pendingPayment?.id) {
        settledAmount = toNumber(pendingPayment.amount, settledAmount);

        const { error: updatePaymentError } = await supabase
          .from("order_payments")
          .update({
            amount: settledAmount,
            status: "pago",
            paid_at: resolvedPaidAt,
            gateway: "PagSeguro",
            gateway_order_id: referenceId,
            gateway_transaction_id: paymentId,
            raw_payload: payload,
            notes: "Pagamento confirmado via webhook PagSeguro",
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
            gateway: "PagSeguro",
            gateway_order_id: referenceId,
            gateway_transaction_id: paymentId,
            raw_payload: payload,
            notes: "Pagamento confirmado via webhook PagSeguro",
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
        .eq("order_id", order.id)

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
            payment_id: paymentId || order.payment_id,
            gateway: "PagSeguro",
            gateway_order_id: referenceId,
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
    gateway: "PagSeguro",
    event_type: eventType,
    external_event_id: normalizeText(payload?.id) || normalizeText(req.headers.get("x-request-id")),
    payment_id: paymentId || order.payment_id,
    status: paymentStatus || null,
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
