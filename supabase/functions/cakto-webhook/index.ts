import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, verifyWebhookSignature } from "../_shared/cakto.ts";

export const config = { verify_jwt: false };

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

const getSupabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

const normalizeEvent = (value: string) =>
  value.toLowerCase().replace(/[\s_]+/g, '.');

const isAllowedEvent = (eventName: string) => {
  if (!eventName) return false;
  const ev = normalizeEvent(eventName);
  if (ev.includes('purchase') && ev.includes('approved')) return true;
  if (ev.includes('subscription') && (ev.includes('active') || ev.includes('renewed'))) {
    return true;
  }
  if (ev.includes('payment') && ev.includes('approved')) return true;
  return false;
};

const hashPayload = async (raw: string) => {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const toIso = (value?: string | number | null) => {
  if (!value) return null;
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'empresa';

const generatePassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getAdminUserByEmail = async (supabase: ReturnType<typeof getSupabaseClient>, email: string) => {
  const admin = supabase.auth?.admin as {
    getUserByEmail?: (email: string) => Promise<{ data?: { user?: { id: string } | null }; error?: { message: string } | null }>;
    listUsers?: (params?: { page?: number; perPage?: number }) => Promise<{ data?: { users?: { id: string; email?: string | null }[] }; error?: { message: string } | null }>;
  } | undefined;

  if (admin?.getUserByEmail) {
    const { data, error } = await admin.getUserByEmail(email);
    if (error) {
      return { userId: null, error: error.message };
    }
    return { userId: data?.user?.id ?? null, error: null };
  }

  if (admin?.listUsers) {
    const { data, error } = await admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      return { userId: null, error: error.message };
    }
    const match = data?.users?.find(user => user.email?.toLowerCase() === email.toLowerCase());
    return { userId: match?.id ?? null, error: null };
  }

  return { userId: null, error: 'Supabase admin getUserByEmail is unavailable' };
};

const sendAccessEmail = async (params: {
  email: string;
  fullName?: string | null;
  password?: string | null;
  appUrl: string;
  companyName?: string | null;
}) => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !fromEmail) {
    console.warn('Email provider not configured. Skipping access email.');
    return false;
  }

  const loginUrl = `${params.appUrl.replace(/\/$/, '')}/auth`;
  const name = params.fullName ?? params.email;
  const companyLabel = params.companyName ? `Empresa: ${params.companyName}` : null;
  const passwordLine = params.password
    ? `Senha temporaria: ${params.password}`
    : 'Sua conta ja existe. Use sua senha atual.';

  const text = [
    `Ola ${name},`,
    '',
    'Sua assinatura foi ativada.',
    companyLabel,
    `Acesse o sistema: ${loginUrl}`,
    `Email de acesso: ${params.email}`,
    passwordLine,
    '',
    'No primeiro login, altere sua senha.',
  ].filter(Boolean).join('\n');

  const html = `
    <div>
      <p>Ola ${name},</p>
      <p>Sua assinatura foi ativada.</p>
      ${params.companyName ? `<p><strong>Empresa:</strong> ${params.companyName}</p>` : ''}
      <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Email de acesso:</strong> ${params.email}</p>
      <p><strong>${params.password ? 'Senha temporaria' : 'Aviso'}:</strong> ${params.password ?? 'Sua conta ja existe. Use sua senha atual.'}</p>
      <p>No primeiro login, altere sua senha.</p>
    </div>
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.email,
      subject: 'Acesso liberado - GraficaERP',
      text,
      html,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    console.error('Failed to send access email', resp.status, errorText);
    return false;
  }
  return true;
};

serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Invalid method' });

  const raw = await req.text().catch(() => '');
  const sigHeader = req.headers.get('x-cakto-signature') ?? req.headers.get('x-signature') ?? null;
  const cfg = getCaktoConfig();

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  let ok = await verifyWebhookSignature(cfg, raw, sigHeader);
  if (!ok && cfg.webhookSecret) {
    const payloadSecret = payload?.secret ?? payload?.data?.secret ?? null;
    if (payloadSecret && payloadSecret === cfg.webhookSecret) {
      ok = true;
    }
  }
  if (!ok) return jsonResponse(401, { error: 'Invalid signature' });

  const event =
    payload?.event ??
    payload?.event_id ??
    payload?.eventId ??
    payload?.type ??
    payload?.event_type ??
    null;
  const data = payload?.data ?? payload?.payload?.data ?? payload?.object ?? payload;

  const supabase = getSupabaseClient();

  try {
    if (!event) return jsonResponse(400, { error: 'No event' });

    const eventId =
      payload?.id ??
      payload?.event_id ??
      payload?.eventId ??
      data?.event_id ??
      data?.id ??
      req.headers.get('x-event-id') ??
      await hashPayload(raw);

    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id, processed_at')
      .eq('event_id', eventId)
      .maybeSingle();

    if (!existingEvent) {
      await supabase.from('webhook_events').upsert({
        gateway: 'cakto',
        event_id: eventId,
        event_type: event?.toString() ?? null,
        payload,
      }, { onConflict: 'event_id' });
    } else if (existingEvent.processed_at) {
      return jsonResponse(200, { ok: true, duplicate: true });
    }

    if (!isAllowedEvent(event.toString())) {
      await supabase.from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return jsonResponse(200, { ok: true, ignored: true });
    }

    const caktoSubId =
      data?.subscription?.id ??
      data?.subscription?.subscription_id ??
      data?.subscription_id ??
      data?.subscriptionId ??
      data?.id ??
      data?.refId ??
      null;
    const rawStatus = data?.status ?? data?.state ?? null;
    const normalizedStatus = (() => {
      const ev = normalizeEvent(event.toString());
      if (ev.includes('purchase') && ev.includes('approved')) return 'active';
      if (ev.includes('payment') && ev.includes('approved')) return 'active';
      if (ev.includes('subscription') && (ev.includes('active') || ev.includes('renewed'))) {
        return 'active';
      }
      if (typeof rawStatus === 'string' && rawStatus.toLowerCase().includes('active')) return 'active';
      if (typeof rawStatus === 'string' && rawStatus.toLowerCase().includes('approved')) return 'active';
      if (typeof rawStatus === 'string' && rawStatus.toLowerCase().includes('paid')) return 'active';
      return null;
    })();
    const currentPeriodEndsAt = toIso(
      data?.current_period_end ??
      data?.current_period_ends_at ??
      data?.current_period_end_at ??
      data?.current_period_end_date,
    );
    const currentPeriodStartsAt = toIso(
      data?.current_period_start ??
      data?.current_period_starts_at ??
      data?.current_period_start_at ??
      data?.current_period_start_date,
    );

    const metadata = data?.metadata ?? data?.meta ?? payload?.metadata ?? {};
    const checkoutToken = metadata?.checkout_token ?? metadata?.token ?? data?.checkout_token ?? null;

    console.log('[CAKTO/WEBHOOK] Event', {
      event_id: eventId,
      event_type: event?.toString() ?? null,
      payment_status: data?.payment_status ?? data?.status ?? null,
      subscription_id: caktoSubId,
      checkout_token: checkoutToken,
    });

    const customerEmail =
      data?.customer?.email ??
      data?.customer_email ??
      data?.email ??
      metadata?.email ??
      null;
    const customerName =
      data?.customer?.name ??
      data?.customer_name ??
      metadata?.full_name ??
      metadata?.name ??
      null;
    const companyName =
      metadata?.company_name ??
      data?.company_name ??
      null;

    let checkout: any = null;
    if (checkoutToken) {
      const { data: checkoutRow } = await supabase
        .from('subscription_checkouts')
        .select('*')
        .eq('token', checkoutToken)
        .maybeSingle();
      checkout = checkoutRow;
    }

    let planId: string | null = checkout?.plan_id ?? null;
    const offerId =
      data?.offer?.id ??
      data?.offer_id ??
      data?.offerId ??
      data?.plan_id ??
      null;
    if (!planId && offerId) {
      const offerUrl = /^https?:\/\//i.test(offerId)
        ? offerId
        : `https://pay.cakto.com.br/${offerId}`;
      const { data: plan } = await supabase
        .from('plans')
        .select('id')
        .in('cakto_plan_id', [offerId, offerUrl])
        .maybeSingle();
      planId = plan?.id ?? null;
    }

    if (checkout?.status === 'active' || checkout?.status === 'completed') {
      await supabase.from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return jsonResponse(200, { ok: true, duplicate: true });
    }

    const email = (checkout?.email ?? customerEmail ?? '').toString().trim().toLowerCase();
    if (!checkout && email && planId) {
      const { data: fallbackCheckout } = await supabase
        .from('subscription_checkouts')
        .select('*')
        .eq('email', email)
        .eq('plan_id', planId)
        .in('status', ['created', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      checkout = fallbackCheckout;
    }
    if (!email || !planId || !caktoSubId || !normalizedStatus) {
      await supabase.from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return jsonResponse(200, { ok: true, skipped: true });
    }

    let userId = checkout?.user_id ?? null;
    let tempPassword: string | null = null;
    if (!userId) {
      const { userId: existingUserId, error } = await getAdminUserByEmail(supabase, email);
      if (error) {
        console.warn('Failed to lookup user by email', error);
      }
      userId = existingUserId;
    }

    if (!userId) {
      const password = generatePassword();
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: checkout?.full_name ?? customerName ?? email },
      });
      if (createError || !createdUser.user?.id) {
        throw new Error(createError?.message || 'Failed to create user');
      }
      userId = createdUser.user.id;
      tempPassword = password;
    }

    let companyId = checkout?.company_id ?? null;
    if (!companyId) {
      const baseName = (checkout?.company_name ?? companyName ?? customerName ?? email.split('@')[0] ?? 'Empresa').toString();
      const baseSlug = buildSlug(baseName);
      let slug = baseSlug;
      let suffix = 1;
      while (true) {
        const { data: existingCompany } = await supabase
          .from('companies')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!existingCompany) break;
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
        if (suffix > 25) {
          slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
          break;
        }
      }

      const { data: createdCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: baseName,
          slug,
          email,
          is_active: true,
          plan_id: planId,
          subscription_status: normalizedStatus,
          subscription_start_date: currentPeriodStartsAt ?? new Date().toISOString(),
          subscription_end_date: currentPeriodEndsAt,
        })
        .select('id')
        .single();

      if (companyError || !createdCompany?.id) {
        throw new Error(companyError?.message || 'Failed to create company');
      }
      companyId = createdCompany.id;
    }

    if (userId && companyId) {
      const profilePayload: Record<string, unknown> = {
        id: userId,
        full_name: checkout?.full_name ?? customerName ?? email,
        company_id: companyId,
      };
      if (tempPassword) {
        profilePayload.force_password_change = true;
      }
      await supabase.from('profiles').upsert(profilePayload);

      const roleResp = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
      if (roleResp.error) {
        console.error('Failed to set user role', roleResp.error.message);
      }

      const linkResp = await supabase.from('company_users').insert({ company_id: companyId, user_id: userId });
      if (linkResp.error) {
        console.error('Failed to link user to company', linkResp.error.message);
      }
    }

    const subscriptionPayload: Record<string, unknown> = {
      user_id: userId,
      company_id: companyId,
      plan_id: planId,
      status: normalizedStatus,
      gateway: 'cakto',
      gateway_subscription_id: caktoSubId,
      current_period_ends_at: currentPeriodEndsAt,
      trial_ends_at: null,
      payment_link_url: data?.payment_link_url ?? data?.checkout_url ?? data?.checkoutUrl ?? data?.payment_url ?? null,
      gateway_order_id: data?.order_id ?? data?.orderId ?? data?.id ?? data?.refId ?? null,
      gateway_payment_link_id: data?.payment_link_id ?? data?.paymentLinkId ?? null,
      last_payment_status: data?.payment_status ?? data?.status ?? null,
    };

    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('gateway_subscription_id', caktoSubId)
      .maybeSingle();

    if (existingSubscription?.id) {
      await supabase.from('subscriptions').update(subscriptionPayload).eq('id', existingSubscription.id);
    } else {
      await supabase.from('subscriptions').insert(subscriptionPayload);
    }

    if (companyId) {
      const companyUpdate: Record<string, unknown> = {
        plan_id: planId,
        subscription_status: normalizedStatus,
        subscription_start_date: currentPeriodStartsAt ?? new Date().toISOString(),
        subscription_end_date: currentPeriodEndsAt,
      };
      await supabase.from('companies').update(companyUpdate).eq('id', companyId);
    }

    let shouldSendEmail = false;
    if (checkout?.id) {
      shouldSendEmail = checkout?.status !== 'completed';
      await supabase.from('subscription_checkouts').update({
        status: 'completed',
        cakto_subscription_id: caktoSubId,
        user_id: userId,
        company_id: companyId,
      }).eq('id', checkout.id);
    }

    const appUrl = Deno.env.get('APP_PUBLIC_URL') ?? '';
    if (appUrl && shouldSendEmail) {
      await sendAccessEmail({
        email,
        fullName: checkout?.full_name ?? customerName ?? null,
        password: tempPassword,
        appUrl,
        companyName: checkout?.company_name ?? companyName ?? null,
      });
    }

    await supabase.from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error('Webhook handler error', e);
    return jsonResponse(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
