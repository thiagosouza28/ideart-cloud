// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, verifyWebhookSignature } from "../_shared/cakto.ts";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

const getSupabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Invalid method' });

  const raw = await req.text().catch(() => '');
  const sigHeader = req.headers.get('x-cakto-signature') ?? req.headers.get('x-signature') ?? null;
  const cfg = getCaktoConfig();
  const ok = await verifyWebhookSignature(cfg, raw, sigHeader);
  if (!ok) return jsonResponse(401, { error: 'Invalid signature' });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const event = payload?.event ?? payload?.type ?? null;
  const data = payload?.data ?? payload?.object ?? payload;

  const supabase = getSupabaseClient();

  try {
    if (!event) return jsonResponse(400, { error: 'No event' });

    // Normalize event name
    const ev = event.toString().toLowerCase();

    if (ev.includes('subscription')) {
      const caktoSubId = data?.id ?? data?.subscription_id ?? data?.subscriptionId;
      const status = data?.status ?? data?.state ?? null;
      const periodStart = data?.current_period_start ? new Date(data.current_period_start) : null;
      const periodEnd = data?.current_period_end ? new Date(data.current_period_end) : null;

      if (caktoSubId) {
        // Update subscription record
        const update: Record<string, unknown> = {};
        if (status) update.status = status;
        if (periodStart) update.current_period_start = periodStart.toISOString();
        if (periodEnd) update.current_period_end = periodEnd.toISOString();

        if (Object.keys(update).length > 0) {
          await supabase.from('subscriptions').update(update).eq('cakto_subscription_id', caktoSubId);
        }
      }
    }

    if (ev.includes('payment') || ev.includes('invoice')) {
      // You can handle payment events here; for now update status if needed
      const caktoSubId = data?.subscription_id ?? data?.id ?? null;
      if (caktoSubId && data?.status === 'failed') {
        await supabase.from('subscriptions').update({ status: 'payment_failed' }).eq('cakto_subscription_id', caktoSubId);
      }
    }

    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error('Webhook handler error', e);
    return jsonResponse(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
