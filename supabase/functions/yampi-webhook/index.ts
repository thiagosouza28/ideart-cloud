import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  buildWebhookEventId,
  computeWebhookSignature,
  timingSafeEqual,
} from "../_shared/yampi.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[YAMPI-WEBHOOK] ${step}${detailsStr}`);
};

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

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

const isEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

const pickFirstEmail = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && isEmail(value)) {
      return value.trim().toLowerCase();
    }
  }
  return null;
};

const parseJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const normalizeText = (value?: string | null) => (value || "").trim().toLowerCase();

const normalizeSignature = (value: string) =>
  value.replace(/^sha256=/i, "").trim();

const extractEventType = (payload: Record<string, unknown> | null) => {
  if (!payload) return "unknown";
  return (
    pickFirstString(
      payload.event,
      payload.type,
      payload.event_type,
      payload.name,
    ) || "unknown"
  );
};

const extractDataPayload = (payload: Record<string, unknown> | null) =>
  asRecord(payload?.data) ||
  asRecord(payload?.payload) ||
  asRecord(payload?.resource) ||
  payload;

const extractOrderPayload = (
  data: Record<string, unknown> | null,
  payload: Record<string, unknown> | null,
) =>
  asRecord(data?.order) ||
  asRecord((data as Record<string, unknown> | null)?.order_data) ||
  asRecord(payload?.order) ||
  asRecord(payload?.order_data) ||
  null;

const extractItems = (
  order: Record<string, unknown> | null,
  data: Record<string, unknown> | null,
  payload: Record<string, unknown> | null,
) => {
  const candidates = [
    order?.items,
    order?.order_items,
    order?.products,
    data?.items,
    data?.order_items,
    payload?.items,
    payload?.order_items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }
  }

  return [];
};

const extractItemRefs = (items: Record<string, unknown>[]) => {
  let productId: string | null = null;
  let skuId: string | null = null;

  for (const item of items) {
    if (!productId) {
      productId = pickFirstString(
        item.product_id,
        item.productId,
        (item.product as Record<string, unknown> | null)?.id,
        (item.product as Record<string, unknown> | null)?.product_id,
      );
    }

    if (!skuId) {
      skuId = pickFirstString(
        item.sku,
        item.sku_id,
        item.product_sku_id,
        (item.product as Record<string, unknown> | null)?.sku,
        (item.product as Record<string, unknown> | null)?.sku_id,
      );
    }

    if (productId || skuId) break;
  }

  return { productId, skuId };
};

const extractTransactionPayload = (
  data: Record<string, unknown> | null,
  payload: Record<string, unknown> | null,
) =>
  asRecord(data?.transaction) ||
  asRecord(data?.payment) ||
  asRecord(data?.charge) ||
  asRecord(payload?.transaction) ||
  asRecord(payload?.payment) ||
  null;

const extractIdentifiers = (
  data: Record<string, unknown> | null,
  order: Record<string, unknown> | null,
  transaction: Record<string, unknown> | null,
) => {
  const gatewayOrderId = pickFirstString(
    order?.id,
    order?.order_id,
    data?.order_id,
    data?.orderId,
  );
  const paymentLinkId = pickFirstString(
    order?.payment_link_id,
    (order?.payment_link as Record<string, unknown> | null)?.id,
    data?.payment_link_id,
    data?.paymentLinkId,
    transaction?.payment_link_id,
  );
  const gatewaySubscriptionId = pickFirstString(
    order?.subscription_id,
    order?.subscriptionId,
    data?.subscription_id,
    data?.subscriptionId,
    transaction?.subscription_id,
  );

  return {
    gatewayOrderId,
    paymentLinkId,
    gatewaySubscriptionId,
  };
};

const resolveSubscriptionStatus = (
  eventType: string,
  statusHint?: string | null,
) => {
  const normalizedEvent = normalizeText(eventType);
  const normalizedHint = normalizeText(statusHint || "");

  const isPaid = normalizedEvent.includes("paid") ||
    normalizedHint.includes("paid") ||
    normalizedHint.includes("pago") ||
    normalizedHint.includes("approved") ||
    normalizedHint.includes("aprovado");
  if (isPaid) return "active";

  const isCanceled = normalizedEvent.includes("canceled") ||
    normalizedEvent.includes("cancelled") ||
    normalizedHint.includes("canceled") ||
    normalizedHint.includes("cancelado");
  if (isCanceled) return "canceled";

  const isExpired = normalizedEvent.includes("expired") ||
    normalizedHint.includes("expired") ||
    normalizedHint.includes("expirado");
  const isRefused = normalizedEvent.includes("refused") ||
    normalizedEvent.includes("failed") ||
    normalizedHint.includes("refused") ||
    normalizedHint.includes("failed");
  if (isExpired || isRefused) return "expired";

  return null;
};

const addBillingPeriod = (base: Date, billingPeriod: string | null) => {
  const next = new Date(base);
  if (billingPeriod === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
};

const addDays = (base: Date, days: number) => {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Invalid method" }), {
      headers: { "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const body = await req.text();
    const payload = parseJson(body);
    if (!payload || !asRecord(payload)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const webhookSecret = Deno.env.get("YAMPI_WEBHOOK_SECRET");
    const signatureHeader = req.headers.get("x-yampi-signature") ||
      req.headers.get("x-yampi-hmac") ||
      req.headers.get("x-signature") ||
      req.headers.get("signature");

    if (webhookSecret && signatureHeader) {
      const expected = await computeWebhookSignature(webhookSecret, body);
      const normalizedHeader = normalizeSignature(signatureHeader);
      const normalizedExpected = normalizeSignature(expected);
      if (!timingSafeEqual(normalizedHeader, normalizedExpected)) {
        logStep("Signature mismatch");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          headers: { "Content-Type": "application/json" },
          status: 401,
        });
      }
    }

    const eventType = extractEventType(payload);
    const eventIdHeader = req.headers.get("x-yampi-event-id") ||
      req.headers.get("x-event-id");
    const eventId =
      pickFirstString(
        eventIdHeader,
        payload.event_id,
        payload.eventId,
        (payload.data as Record<string, unknown> | null)?.event_id,
        (payload.data as Record<string, unknown> | null)?.eventId,
      ) || await buildWebhookEventId(payload, body);

    const supabase = getSupabaseClient();

    const { error: insertEventError } = await supabase
      .from("subscription_events")
      .insert(
        {
          event_id: eventId,
          event_type: eventType,
          payload,
        },
        { returning: "minimal" },
      );

    if (insertEventError) {
      if ((insertEventError as { code?: string }).code === "23505") {
        logStep("Duplicate event ignored", { eventId, eventType });
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw insertEventError;
    }

    const data = extractDataPayload(payload);
    const orderPayload = extractOrderPayload(data, payload);
    const transactionPayload = extractTransactionPayload(data, payload);
    const items = extractItems(orderPayload, data, payload);
    const { productId, skuId } = extractItemRefs(items);

    const customerPayload =
      asRecord(orderPayload?.customer) ||
      asRecord(orderPayload?.buyer) ||
      asRecord(orderPayload?.client) ||
      asRecord(data?.customer) ||
      asRecord(payload?.customer) ||
      null;

    const customerEmail = pickFirstEmail(
      customerPayload?.email,
      orderPayload?.customer_email,
      orderPayload?.email,
      data?.customer_email,
      payload?.customer_email,
    );

    const { gatewayOrderId, paymentLinkId, gatewaySubscriptionId } =
      extractIdentifiers(data, orderPayload, transactionPayload);

    logStep("Event received", {
      eventId,
      eventType,
      gatewayOrderId,
      paymentLinkId,
      gatewaySubscriptionId,
      productId,
      skuId,
      customerEmail,
    });

    let plan:
      | { id: string; billing_period: string | null; period_days: number | null }
      | null = null;

    if (productId) {
      const { data: byProduct } = await supabase
        .from("plans")
        .select("id, billing_period, period_days")
        .eq("yampi_product_id", productId)
        .maybeSingle();
      plan = byProduct ?? null;
    }

    if (!plan && skuId) {
      const { data: bySku } = await supabase
        .from("plans")
        .select("id, billing_period, period_days")
        .eq("yampi_sku_id", skuId)
        .maybeSingle();
      plan = bySku ?? null;
    }

    let userId: string | null = null;
    if (customerEmail) {
      const admin = supabase.auth.admin as Record<string, unknown>;
      const getUserByEmail = admin?.getUserByEmail as
        | ((email: string) => Promise<{ data?: { user?: { id: string } }; error?: { message?: string } }>)
        | undefined;
      if (getUserByEmail) {
        const { data: userData, error: userError } = await getUserByEmail(
          customerEmail,
        );
        if (userError) {
          logStep("User lookup failed", { message: userError.message });
        }
        userId = userData?.user?.id ?? null;
      } else {
        const listUsers = admin?.listUsers as
          | ((params?: {
            page?: number;
            perPage?: number;
          }) => Promise<{ data?: { users?: { id: string; email?: string }[] } }>)
          | undefined;
        if (listUsers) {
          const { data: listData } = await listUsers({ page: 1, perPage: 1000 });
          userId =
            listData?.users?.find(
              (candidate) => candidate.email?.toLowerCase() === customerEmail,
            )?.id ?? null;
        }
      }
    }

    let companyId: string | null = null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      companyId = profile?.company_id ?? null;
    }

    if (!companyId && customerEmail) {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("email", customerEmail)
        .maybeSingle();
      companyId = company?.id ?? null;
    }

    const statusHint = pickFirstString(
      orderPayload?.status,
      transactionPayload?.status,
      data?.status,
    );
    const subscriptionStatus = resolveSubscriptionStatus(eventType, statusHint);

    let subscription:
      | {
        id: string;
        user_id: string | null;
        company_id: string | null;
        plan_id: string | null;
        current_period_ends_at: string | null;
        gateway_order_id: string | null;
        gateway_payment_link_id: string | null;
        gateway_subscription_id: string | null;
      }
      | null = null;

    if (gatewaySubscriptionId) {
      const { data: bySubscription } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .eq("gateway_subscription_id", gatewaySubscriptionId)
        .maybeSingle();
      subscription = bySubscription;
    }

    if (!subscription && gatewayOrderId) {
      const { data: byOrder } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .eq("gateway_order_id", gatewayOrderId)
        .maybeSingle();
      subscription = byOrder;
    }

    if (!subscription && paymentLinkId) {
      const { data: byLink } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .eq("gateway_payment_link_id", paymentLinkId)
        .maybeSingle();
      subscription = byLink;
    }

    if (!subscription && plan?.id && userId) {
      const { data: byUserPlan } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .eq("user_id", userId)
        .eq("plan_id", plan.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      subscription = byUserPlan;
    }

    if (!subscription && plan?.id && companyId) {
      const { data: byCompanyPlan } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .eq("company_id", companyId)
        .eq("plan_id", plan.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      subscription = byCompanyPlan;
    }

    if (!subscription && subscriptionStatus && plan?.id && companyId) {
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        company_id: companyId,
        plan_id: plan.id,
        status: subscriptionStatus,
        gateway: "yampi",
        gateway_order_id: gatewayOrderId,
        gateway_payment_link_id: paymentLinkId,
        gateway_subscription_id: gatewaySubscriptionId,
        last_payment_status: statusHint ?? eventType,
        current_period_ends_at: null,
      };

      if (subscriptionStatus === "active") {
        const baseDate = new Date();
        const periodDays = plan.period_days ?? null;
        const nextPeriod = periodDays && periodDays > 0
          ? addDays(baseDate, periodDays)
          : addBillingPeriod(baseDate, plan.billing_period || "");
        insertPayload.current_period_ends_at = nextPeriod.toISOString();
      }

      const { data: created } = await supabase
        .from("subscriptions")
        .insert(insertPayload)
        .select(
          "id, user_id, company_id, plan_id, current_period_ends_at, gateway_order_id, gateway_payment_link_id, gateway_subscription_id",
        )
        .single();
      subscription = created ?? null;
    }

    if (subscription && subscriptionStatus) {
      let nextPeriodEnd = subscription.current_period_ends_at;
      if (subscriptionStatus === "active" && subscription.plan_id) {
        const planId = subscription.plan_id;
        let billingPeriod = plan?.id === planId ? plan.billing_period : null;
        let periodDays = plan?.id === planId ? plan.period_days : null;
        if (!billingPeriod || periodDays === null) {
          const { data: planData } = await supabase
            .from("plans")
            .select("billing_period, period_days")
            .eq("id", planId)
            .maybeSingle();
          billingPeriod = planData?.billing_period ?? billingPeriod;
          periodDays = planData?.period_days ?? periodDays;
        }

        const baseDate = subscription.current_period_ends_at
          ? new Date(subscription.current_period_ends_at)
          : new Date();
        const now = new Date();
        const base = baseDate > now ? baseDate : now;
        const nextPeriod = periodDays && periodDays > 0
          ? addDays(base, periodDays)
          : addBillingPeriod(base, billingPeriod || null);
        nextPeriodEnd = nextPeriod.toISOString();
      }

      const subscriptionUpdate: Record<string, unknown> = {
        status: subscriptionStatus,
        gateway: "yampi",
        gateway_order_id: gatewayOrderId ?? subscription.gateway_order_id,
        gateway_payment_link_id:
          paymentLinkId ?? subscription.gateway_payment_link_id,
        gateway_subscription_id:
          gatewaySubscriptionId ?? subscription.gateway_subscription_id,
        last_payment_status: statusHint ?? eventType,
        current_period_ends_at: nextPeriodEnd,
      };

      if (!subscription.plan_id && plan?.id) {
        subscriptionUpdate.plan_id = plan.id;
      }

      if (!subscription.company_id && companyId) {
        subscriptionUpdate.company_id = companyId;
      }

      if (!subscription.user_id && userId) {
        subscriptionUpdate.user_id = userId;
      }

      if (subscriptionStatus === "active") {
        subscriptionUpdate.trial_ends_at = null;
      }

      const { error: subscriptionUpdateError } = await supabase
        .from("subscriptions")
        .update(subscriptionUpdate)
        .eq("id", subscription.id);

      if (subscriptionUpdateError) throw subscriptionUpdateError;

      const targetCompanyId = subscription.company_id ?? companyId;
      if (targetCompanyId) {
        const companyUpdate: Record<string, unknown> = {
          subscription_status: subscriptionStatus,
        };

        const planIdForCompany = subscription.plan_id ?? plan?.id;
        if (planIdForCompany && subscriptionStatus === "active") {
          companyUpdate.plan_id = planIdForCompany;
        }

        if (subscriptionStatus === "active") {
          const { data: companyData } = await supabase
            .from("companies")
            .select("subscription_start_date")
            .eq("id", targetCompanyId)
            .maybeSingle();
          if (!companyData?.subscription_start_date) {
            companyUpdate.subscription_start_date = new Date().toISOString();
          }
          companyUpdate.subscription_end_date = nextPeriodEnd;
        }

        const { error: companyUpdateError } = await supabase
          .from("companies")
          .update(companyUpdate)
          .eq("id", targetCompanyId);

        if (companyUpdateError) throw companyUpdateError;
      }
    } else {
      logStep("No subscription update applied", {
        eventId,
        eventType,
        subscriptionFound: Boolean(subscription),
        subscriptionStatus,
        planId: plan?.id ?? null,
        userId,
        companyId,
      });
    }

    await supabase
      .from("subscription_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId);

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
