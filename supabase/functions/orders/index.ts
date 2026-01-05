import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

const getCorsHeaders = (origin: string | null) => {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ORDERS] ${step}${detailsStr}`);
};

const safeHeaders = (req: Request) => ({
  origin: req.headers.get("origin"),
  referer: req.headers.get("referer"),
  "content-type": req.headers.get("content-type"),
  "user-agent": req.headers.get("user-agent"),
  "x-forwarded-for": req.headers.get("x-forwarded-for"),
  "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
});

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

const statusLabels: Record<string, string> = {
  orcamento: "Orçamento",
  pendente: "Pendente",
  em_producao: "Em produção",
  pronto: "Pronto",
  aguardando_retirada: "Aguardando retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const statusTransitions: Record<string, string[]> = {
  orcamento: ["pendente", "cancelado"],
  pendente: ["em_producao", "cancelado"],
  em_producao: ["pronto", "cancelado"],
  pronto: ["aguardando_retirada", "cancelado"],
  aguardando_retirada: ["entregue", "cancelado"],
  entregue: [],
  cancelado: ["pendente"],
};

const isStatusTransitionAllowed = (from: string, to: string) =>
  from === to || statusTransitions[from]?.includes(to);

const formatStatusLabel = (value: string) => {
  const normalized = value.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getRouteSegments = (url: URL, functionName: string) => {
  const segments = url.pathname.split("/").filter(Boolean);
  const functionIndex = segments.indexOf(functionName);
  if (functionIndex === -1) return segments;
  return segments.slice(functionIndex + 1);
};

type StatusUpdatePayload = {
  status?: string;
  notes?: string | null;
};

type ItemsUpdatePayload = {
  items?: Array<{
    id?: string;
    product_id?: string | null;
    product_name?: string;
    quantity?: number;
    unit_price?: number;
    discount?: number;
    notes?: string | null;
    attributes?: Record<string, string> | null;
  }>;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(req.url);
  logStep("Request received", {
    method: req.method,
    path: url.pathname,
    headers: safeHeaders(req),
  });

  if (req.method !== "PATCH" && req.method !== "DELETE") {
    return jsonResponse(corsHeaders, 405, { error: "Invalid method" });
  }

  const segments = getRouteSegments(url, "orders");
  const normalizedSegments = segments[0] === "orders"
    ? segments.slice(1)
    : segments;
  const orderId = normalizedSegments[0];
  const action = normalizedSegments[1];
  if (req.method === "PATCH") {
    if (normalizedSegments.length !== 2 || !["status", "items", "cancel"].includes(action)) {
      return jsonResponse(corsHeaders, 404, { error: "Not found" });
    }
  }
  if (req.method === "DELETE") {
    if (normalizedSegments.length !== 1) {
      return jsonResponse(corsHeaders, 404, { error: "Not found" });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase config" });
    }

    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = key.toLowerCase().includes('authorization') ? (value.slice(0, 15) + '...') : value;
    });
    logStep("All headers (masked auth)", allHeaders);

    const authHeader = req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization");
    logStep("Auth header present", {
      x_supabase_auth: Boolean(req.headers.get("x-supabase-authorization")),
      authorization: Boolean(req.headers.get("Authorization"))
    });
    if (!authHeader) {
      logStep("ERROR", "No authorization header found");
      return jsonResponse(corsHeaders, 401, {
        error: "No authorization header",
        detail: "Missing Authorization or X-Supabase-Authorization"
      });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      logStep("ERROR", { authError: authError?.message || "User not found" });
      return jsonResponse(corsHeaders, 401, {
        error: "Invalid session",
        detail: authError?.message || "Auth user not found for provided token"
      });
    }

    const userId = authData.user.id;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "atendente", "caixa", "producao"])
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }
    const userRole = roleData.role;

    if (req.method === "DELETE") {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, status, deleted_at")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return jsonResponse(corsHeaders, 404, { error: "Pedido nao encontrado" });
      }

      if (order.deleted_at) {
        return jsonResponse(corsHeaders, 400, { error: "Pedido ja excluido" });
      }

      if (order.status !== "orcamento") {
        return jsonResponse(corsHeaders, 403, {
          error: "Somente orçamentos podem ser excluídos",
        });
      }

      const { error: deleteError } = await supabase
        .from("orders")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq("id", orderId);

      if (deleteError) {
        return jsonResponse(corsHeaders, 400, {
          error: deleteError.message || "Falha ao excluir orçamento",
        });
      }

      return jsonResponse(corsHeaders, 200, { ok: true });
    }

    if (action === "cancel") {
      const body = (await req.json().catch(() => ({}))) as { motivo?: string; confirm_paid?: boolean };
      const reason = typeof body.motivo === "string" ? body.motivo.trim() : null;
      const confirmPaid = Boolean(body.confirm_paid);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, status, payment_status, deleted_at")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return jsonResponse(corsHeaders, 404, { error: "Pedido nao encontrado" });
      }

      if (order.deleted_at) {
        return jsonResponse(corsHeaders, 400, { error: "Pedido excluido" });
      }

      if (order.status === "cancelado") {
        return jsonResponse(corsHeaders, 400, { error: "Pedido ja cancelado" });
      }

      if (order.payment_status === "pago" && !confirmPaid) {
        return jsonResponse(corsHeaders, 400, {
          error: "Pedido pago. Confirme o cancelamento para prosseguir.",
        });
      }

      const { data: updatedOrder, error: cancelError } = await supabase
        .from("orders")
        .update({
          status: "cancelado",
          cancel_reason: reason,
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId,
          updated_by: userId,
        })
        .eq("id", orderId)
        .select("*")
        .single();

      if (cancelError || !updatedOrder) {
        return jsonResponse(corsHeaders, 400, {
          error: cancelError?.message || "Falha ao cancelar pedido",
        });
      }

      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: orderId,
          status: "cancelado",
          user_id: userId,
          notes: reason ? `Cancelado: ${reason}` : "Cancelado",
        });

      if (historyError) {
        return jsonResponse(corsHeaders, 400, {
          error: historyError.message || "Falha ao registrar historico",
        });
      }

      return jsonResponse(corsHeaders, 200, { order: updatedOrder });
    }

    if (action === "items") {
      const body = (await req.json().catch(() => ({}))) as ItemsUpdatePayload;
      const items = Array.isArray(body.items) ? body.items : [];

      if (items.length === 0) {
        return jsonResponse(corsHeaders, 400, { error: "Itens obrigatorios" });
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return jsonResponse(corsHeaders, 404, { error: "Pedido nao encontrado" });
      }

      if (order.status !== "orcamento") {
        return jsonResponse(corsHeaders, 403, {
          error: "Pedido não pode ser alterado após sair do status Orçamento",
        });
      }

      const { data: updatedOrder, error: updateItemsError } = await supabase.rpc(
        "update_order_items",
        {
          p_order_id: orderId,
          p_items: items,
        },
      );

      if (updateItemsError || !updatedOrder) {
        return jsonResponse(corsHeaders, 400, {
          error: updateItemsError?.message || "Falha ao atualizar itens do pedido",
        });
      }

      return jsonResponse(corsHeaders, 200, { order: updatedOrder });
    }

    const body = (await req.json().catch(() => ({}))) as StatusUpdatePayload & { entrada?: number };
    const status = body.status?.trim();
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const entrada = typeof body.entrada === "number" ? body.entrada : null;

    if (!status) {
      return jsonResponse(corsHeaders, 400, { error: "Status obrigatorio" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, company_id, status, total, amount_paid, payment_status, payment_method, deleted_at")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return jsonResponse(corsHeaders, 404, { error: "Pedido nao encontrado" });
    }
    if (order.deleted_at) {
      return jsonResponse(corsHeaders, 400, { error: "Pedido excluido" });
    }

    if (order.status === "cancelado" && status === "pendente") {
      if (!["admin", "atendente"].includes(userRole)) {
        return jsonResponse(corsHeaders, 403, {
          error: "Somente Admin ou Atendente podem reativar pedidos cancelados",
        });
      }
    }

    if (!isStatusTransitionAllowed(order.status as string, status)) {
      return jsonResponse(corsHeaders, 400, {
        error: "Mudanca de status nao permitida",
      });
    }

    const fromLabel = statusLabels[order.status] ?? formatStatusLabel(order.status);
    const toLabel = statusLabels[status] ?? formatStatusLabel(status);
    const transitionNote = `Status alterado de ${fromLabel} para ${toLabel}.`;
    const historyNotes = notes ? `${transitionNote} ${notes}` : transitionNote;

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status,
        updated_by: userId,
        cancel_reason: status === "cancelado" ? notes || null : null,
      })
      .eq("id", orderId)
      .select("*")
      .single();

    if (updateError || !updatedOrder) {
      return jsonResponse(corsHeaders, 400, {
        error: updateError?.message || "Falha ao atualizar pedido",
      });
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: orderId,
        status,
        user_id: userId,
        notes: historyNotes,
      });

    if (historyError) {
      return jsonResponse(corsHeaders, 400, {
        error: historyError.message || "Falha ao registrar historico",
      });
    }

    if (order.company_id) {
      const label = statusLabels[status] ?? formatStatusLabel(status);
      const { error: notifyError } = await supabase
        .from("order_notifications")
        .insert({
          company_id: order.company_id,
          order_id: orderId,
          type: "status_change",
          title: `Pedido #${order.order_number}`,
          body: `Status alterado para: ${label}`,
        });

      if (notifyError) {
        return jsonResponse(corsHeaders, 400, {
          error: notifyError.message || "Falha ao notificar status",
        });
      }
    }

    if (status === "pendente" && order.status === "orcamento" && entrada && entrada > 0) {
      const paidAt = new Date().toISOString();
      const newPaid = Number(order.amount_paid || 0) + entrada;
      const paymentStatus = newPaid >= Number(order.total || 0) ? "pago" : "parcial";
      const { error: paymentError } = await supabase
        .from("order_payments")
        .insert({
          order_id: orderId,
          company_id: order.company_id,
          amount: entrada,
          status: "pago",
          method: order.payment_method || "dinheiro",
          paid_at: paidAt,
          created_by: userId,
          notes: "Entrada registrada",
        });
      if (paymentError) {
        return jsonResponse(corsHeaders, 400, {
          error: paymentError.message || "Falha ao registrar entrada",
        });
      }
      const { data: finalOrder, error: updatePaymentError } = await supabase
        .from("orders")
        .update({
          amount_paid: newPaid,
          payment_status: paymentStatus,
        })
        .eq("id", orderId)
        .select("*")
        .single();
      if (updatePaymentError || !finalOrder) {
        return jsonResponse(corsHeaders, 400, {
          error: updatePaymentError?.message || "Falha ao atualizar pagamento",
        });
      }
      return jsonResponse(corsHeaders, 200, { order: finalOrder });
    }

    return jsonResponse(corsHeaders, 200, { order: updatedOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
