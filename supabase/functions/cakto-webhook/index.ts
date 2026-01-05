import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, verifyWebhookSignature } from "../_shared/cakto.ts";
import { sendSmtpEmail } from "../_shared/email.ts";

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

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

const validateCpf = (value: string) => {
  const digits = normalizeDigits(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  return check === Number(digits[10]);
};

const validateCnpj = (value: string) => {
  const digits = normalizeDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * weights1[i];
  let check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (check !== Number(digits[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(digits[i]) * weights2[i];
  check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return check === Number(digits[13]);
};

const validateCpfCnpj = (value: string) => {
  const digits = normalizeDigits(value);
  if (digits.length === 11) return validateCpf(digits);
  if (digits.length === 14) return validateCnpj(digits);
  return false;
};

const validatePhone = (value: string) => {
  const digits = normalizeDigits(value);
  return digits.length === 11 && digits[2] === '9';
};

const isAllowedEvent = (eventName: string) => {
  if (!eventName) return false;
  const ev = normalizeEvent(eventName);
  if (ev.includes('purchase') && ev.includes('approved')) return true;
  if (ev.includes('purchase') && ev.includes('paid')) return true;
  if (ev.includes('subscription') && (ev.includes('active') || ev.includes('renewed'))) {
    return true;
  }
  if (ev.includes('payment') && ev.includes('approved')) return true;
  if (ev.includes('payment') && ev.includes('paid')) return true;
  if (ev.includes('order') && ev.includes('paid')) return true;
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

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const resolvePeriodDays = (planPeriodDays?: number | null, intervalType?: string | null, intervalCount?: number | null) => {
  if (planPeriodDays && planPeriodDays > 0) return planPeriodDays;
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1;
  const normalized = (intervalType ?? 'month').toLowerCase();
  if (normalized.includes('year')) return 365 * count;
  if (normalized.includes('month') || normalized.includes('mes')) return 30 * count;
  if (normalized.includes('week') || normalized.includes('semana')) return 7 * count;
  if (normalized.includes('day') || normalized.includes('dia')) return count;
  return 30 * count;
};

const generatePassword = () => {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = `${lower}${upper}${digits}`;
  const length = 12;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(lower), pick(upper), pick(digits)];
  const rest = Array.from({ length: length - required.length }, () => pick(all));
  const combined = [...required, ...rest];
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
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
  planName?: string | null;
}) => {
  const loginUrl = `${params.appUrl.replace(/\/$/, '')}/auth`;
  const name = params.fullName ?? params.email;
  const companyLabel = params.companyName ? `Empresa: ${params.companyName}` : null;
  const planLabel = params.planName ? `Plano: ${params.planName}` : null;
  const passwordLine = params.password
    ? `Senha temporaria: ${params.password}`
    : 'Sua conta ja existe. Use sua senha atual.';

  const text = [
    `Ola ${name},`,
    '',
    'Sua assinatura foi aprovada e seu acesso esta liberado no IDEARTCLOUD.',
    companyLabel,
    planLabel,
    `Login: ${params.email}`,
    passwordLine,
    `Acesse: ${loginUrl}`,
    '',
    'No primeiro acesso sera obrigatorio:',
    '1) Criar uma nova senha',
    '2) Preencher os dados da empresa',
  ].filter(Boolean).join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>IDEARTCLOUD</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f5f7fb;color:#0f172a;font-family:Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f7fb;padding:24px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,0.08);overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px 8px 32px;">
                    <div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;">
                      IDEARTCLOUD
                    </div>
                    <h1 style="margin:16px 0 8px 0;font-size:24px;line-height:1.3;color:#0f172a;">
                      Acesso liberado
                    </h1>
                    <p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.6;">
                      Ola ${name}, sua assinatura foi aprovada e seu acesso esta liberado.
                    </p>
                    ${params.companyName ? `<p style="margin:0 0 12px 0;color:#0f172a;font-size:14px;"><strong>Empresa:</strong> ${params.companyName}</p>` : ''}
                    ${params.planName ? `<p style="margin:0 0 12px 0;color:#0f172a;font-size:14px;"><strong>Plano:</strong> ${params.planName}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 8px 32px;">
                    <div style="background:#f8fafc;border-radius:12px;padding:16px;">
                      <p style="margin:0 0 8px 0;color:#334155;font-size:14px;"><strong>Login:</strong> ${params.email}</p>
                      <p style="margin:0;color:#334155;font-size:14px;"><strong>${params.password ? 'Senha temporaria' : 'Aviso'}:</strong> ${params.password ?? 'Sua conta ja existe. Use sua senha atual.'}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px 8px 32px;">
                    <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;">
                      Acessar Plataforma
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 32px 24px 32px;">
                    <p style="margin:0 0 8px 0;color:#334155;font-size:14px;">
                      No primeiro acesso sera obrigatorio:
                    </p>
                    <ol style="margin:0;padding-left:18px;color:#334155;font-size:14px;line-height:1.6;">
                      <li>Criar uma nova senha</li>
                      <li>Preencher os dados da empresa</li>
                    </ol>
                    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;">
                      Se precisar de ajuda, fale com nosso suporte.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return await sendSmtpEmail({
    to: params.email,
    subject: 'Seu acesso ao IDEARTCLOUD',
    text,
    html,
  });
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

    const allowByEvent = isAllowedEvent(event.toString());
    const allowByStatus = normalizedStatus === 'active';
    if (!allowByEvent && !allowByStatus) {
      await supabase.from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return jsonResponse(200, { ok: true, ignored: true });
    }

    console.log('[CAKTO/WEBHOOK] Event', {
      event_id: eventId,
      event_type: event?.toString() ?? null,
      payment_status: data?.payment_status ?? data?.status ?? null,
      subscription_id: caktoSubId,
      checkout_token: checkoutToken,
      normalized_status: normalizedStatus,
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
    const rawCustomerPhone =
      data?.customer?.phone ??
      data?.customer?.phone_number ??
      data?.customer_phone ??
      data?.phone ??
      metadata?.phone ??
      null;
    const normalizedCustomerPhone = rawCustomerPhone
      ? normalizeDigits(String(rawCustomerPhone))
      : null;
    const customerPhone = normalizedCustomerPhone && validatePhone(normalizedCustomerPhone)
      ? normalizedCustomerPhone
      : null;

    const rawCustomerDocument =
      data?.customer?.document ??
      data?.customer?.document_number ??
      data?.document ??
      metadata?.document ??
      null;
    const normalizedCustomerDocument = rawCustomerDocument
      ? normalizeDigits(String(rawCustomerDocument))
      : null;
    const customerDocument = normalizedCustomerDocument && validateCpfCnpj(normalizedCustomerDocument)
      ? normalizedCustomerDocument
      : null;
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
      data?.product?.id ??
      data?.product_id ??
      metadata?.plan_id ??
      metadata?.offer_id ??
      metadata?.offerId ??
      null;
    console.log('[cakto-webhook] offer/plan lookup start', {
      offerId,
      checkoutPlanId: checkout?.plan_id ?? null,
      email: customerEmail ?? checkout?.email ?? null,
    });
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

      if (!planId) {
        const offerName =
          data?.offer?.name ??
          metadata?.plan_name ??
          metadata?.offer_name ??
          'Plano Cakto';
        const offerPrice =
          typeof data?.offer?.price === 'number'
            ? data.offer.price
            : Number(data?.offer?.price ?? 0);
        const rawIntervalType =
          data?.offer?.intervalType ??
          data?.offer?.interval_type ??
          data?.offer?.interval_unit ??
          data?.offer?.interval ??
          'month';
        const intervalType = typeof rawIntervalType === 'string' ? rawIntervalType : 'month';
        const intervalCount = typeof rawIntervalType === 'number'
          ? rawIntervalType
          : Number(data?.offer?.interval ?? data?.offer?.interval_count ?? data?.offer?.intervalCount ?? 1);
        const isYearly = intervalType.toLowerCase().includes('year');
        const periodDays = resolvePeriodDays(null, intervalType, intervalCount);

        const { data: createdPlan } = await supabase
          .from('plans')
          .upsert({
            name: offerName,
            description: null,
            price: offerPrice,
            billing_period: isYearly ? 'yearly' : 'monthly',
            period_days: periodDays,
            features: [],
            max_users: null,
            is_active: true,
            cakto_plan_id: offerId,
          }, { onConflict: 'cakto_plan_id' })
          .select('id')
          .maybeSingle();
        planId = createdPlan?.id ?? null;
      }
    }
    console.log('[cakto-webhook] offer/plan lookup resolved', {
      offerId,
      planId,
    });

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
    if (!checkout && email && !planId) {
      const { data: fallbackCheckout } = await supabase
        .from('subscription_checkouts')
        .select('*')
        .eq('email', email)
        .in('status', ['created', 'pending', 'paid', 'active', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      checkout = fallbackCheckout;
      planId = checkout?.plan_id ?? planId;
    }
    console.log('[cakto-webhook] checkout resolve', {
      checkoutId: checkout?.id ?? null,
      checkoutPlanId: checkout?.plan_id ?? null,
      finalPlanId: planId,
    });
    if (!email || !caktoSubId || !normalizedStatus) {
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
        user_metadata: {
          full_name: checkout?.full_name ?? customerName ?? email,
          role: 'admin',
          must_change_password: true,
          must_complete_company: true,
        },
      });
      if (createError || !createdUser.user?.id) {
        throw new Error(createError?.message || 'Failed to create user');
      }
      userId = createdUser.user.id;
      tempPassword = password;
    }

    let createdCompany = false;
    let companyId =
      checkout?.company_id ??
      metadata?.company_id ??
      data?.company_id ??
      data?.companyId ??
      null;
    if (!companyId && caktoSubId) {
      const { data: subscriptionCompany } = await supabase
        .from('subscriptions')
        .select('company_id')
        .eq('gateway_subscription_id', caktoSubId)
        .maybeSingle();
      companyId = subscriptionCompany?.company_id ?? null;
    }
    if (!companyId && userId) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .maybeSingle();
      companyId = profileRow?.company_id ?? null;
    }

    if (!companyId && email) {
      const { data: emailCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      companyId = emailCompany?.id ?? null;
    }

    if (!companyId && userId) {
      const { data: ownedCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_user_id', userId)
        .maybeSingle();
      companyId = ownedCompany?.id ?? null;
    }

    if (!companyId && userId) {
      const { data: companyUserLink, error: companyUserError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (companyUserError) {
        console.warn('Failed to read company_users', companyUserError.message);
      } else {
        companyId = companyUserLink?.company_id ?? null;
      }
    }
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
          completed: false,
        })
        .select('id')
        .single();

      if (companyError || !createdCompany?.id) {
        throw new Error(companyError?.message || 'Failed to create company');
      }
      companyId = createdCompany.id;
      createdCompany = true;
    }

    const { data: planInfo } = planId
      ? await supabase
        .from('plans')
        .select('id, name, period_days, billing_period')
        .eq('id', planId)
        .maybeSingle()
      : { data: null };

    const { data: companyData } = companyId
      ? await supabase
        .from('companies')
        .select('id, subscription_status, subscription_start_date, subscription_end_date, trial_active, trial_ends_at, completed')
        .eq('id', companyId)
        .maybeSingle()
      : { data: null };

    if (!planId && companyData?.plan_id) {
      planId = companyData.plan_id;
    }

    const now = new Date();
    const rawIntervalType =
      data?.offer?.intervalType ??
      data?.offer?.interval_type ??
      data?.offer?.interval_unit ??
      data?.offer?.interval ??
      null;
    const intervalType = typeof rawIntervalType === 'string' ? rawIntervalType : null;
    const intervalCount = typeof rawIntervalType === 'number'
      ? rawIntervalType
      : Number(data?.offer?.interval ?? data?.offer?.interval_count ?? data?.offer?.intervalCount ?? 1);
    const periodDays = resolvePeriodDays(planInfo?.period_days ?? null, intervalType, intervalCount);

    const isActiveNow =
      !createdCompany &&
      (companyData?.subscription_status ?? '').toLowerCase() === 'active' &&
      Boolean(companyData?.subscription_end_date) &&
      new Date(companyData.subscription_end_date ?? '').getTime() >= now.getTime();

    const isTrialNow =
      !createdCompany &&
      (companyData?.subscription_status ?? '').toLowerCase() === 'trial' &&
      Boolean(companyData?.trial_ends_at) &&
      new Date(companyData.trial_ends_at ?? '').getTime() > now.getTime();

    const baseStart = isActiveNow
      ? new Date(companyData?.subscription_end_date ?? now.toISOString())
      : isTrialNow
        ? new Date(companyData?.trial_ends_at ?? now.toISOString())
        : currentPeriodStartsAt
          ? new Date(currentPeriodStartsAt)
          : now;

    const resolvedPeriodEndsAt = addDays(baseStart, periodDays).toISOString();

    if (userId && companyId) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, password_defined')
        .eq('id', userId)
        .maybeSingle();

      const requireCompanyCompletion = !(companyData?.completed ?? false);
      const profilePayload: Record<string, unknown> = {
        id: userId,
        full_name: checkout?.full_name ?? customerName ?? email,
        company_id: companyId,
      };

      if (requireCompanyCompletion) {
        profilePayload.must_complete_onboarding = true;
        profilePayload.must_complete_company = true;
      } else {
        profilePayload.must_complete_onboarding = false;
        profilePayload.must_complete_company = false;
      }

      if (tempPassword) {
        profilePayload.must_change_password = true;
        profilePayload.force_password_change = true;
        profilePayload.password_defined = false;
      } else if (existingProfile?.password_defined) {
        profilePayload.password_defined = true;
      }

      await supabase.from('profiles').upsert(profilePayload);

      const roleResp = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
      if (roleResp.error) {
        console.error('Failed to set user role', roleResp.error.message);
      }

      const { data: existingLink, error: linkLookupError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .maybeSingle();

      if (linkLookupError) {
        console.warn('Failed to read company_users', linkLookupError.message);
      } else if (!existingLink) {
        const linkResp = await supabase.from('company_users').insert({ company_id: companyId, user_id: userId });
        if (linkResp.error) {
          console.error('Failed to link user to company', linkResp.error.message);
        }
      }
    }

    const { data: priorPaidSubscription } = companyId
      ? await supabase
        .from('subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .neq('gateway', 'trial')
        .limit(1)
        .maybeSingle()
      : { data: null };
    const hadPaidSubscription = Boolean(priorPaidSubscription?.id);

    const subscriptionPayload: Record<string, unknown> = {
      user_id: userId,
      company_id: companyId,
      plan_id: planId,
      status: normalizedStatus,
      gateway: 'cakto',
      gateway_subscription_id: caktoSubId,
      current_period_ends_at: resolvedPeriodEndsAt,
      trial_ends_at: null,
      payment_link_url: data?.payment_link_url ?? data?.checkout_url ?? data?.checkoutUrl ?? data?.payment_url ?? null,
      gateway_order_id: data?.order_id ?? data?.orderId ?? data?.id ?? data?.refId ?? null,
      gateway_payment_link_id: data?.payment_link_id ?? data?.paymentLinkId ?? null,
      last_payment_status: data?.payment_status ?? data?.status ?? null,
      customer_name: checkout?.full_name ?? customerName ?? null,
      customer_email: email ?? null,
      customer_phone: customerPhone ?? null,
      customer_document: customerDocument ?? null,
    };

    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('gateway_subscription_id', caktoSubId)
      .maybeSingle();

    const { data: activeSubscription } = companyId
      ? await supabase
        .from('subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null };

    const targetSubscriptionId = existingSubscription?.id ?? activeSubscription?.id ?? null;

    if (targetSubscriptionId) {
      await supabase.from('subscriptions').update(subscriptionPayload).eq('id', targetSubscriptionId);
    } else {
      await supabase.from('subscriptions').insert(subscriptionPayload);
    }

    if (companyId) {
      const companyUpdate: Record<string, unknown> = {
        plan_id: planId,
        subscription_status: normalizedStatus,
        subscription_end_date: resolvedPeriodEndsAt,
        trial_active: false,
        trial_ends_at: null,
      };
      if (createdCompany || !companyData?.subscription_start_date || !isActiveNow) {
        companyUpdate.subscription_start_date = currentPeriodStartsAt ?? new Date().toISOString();
      }
      if (customerPhone) {
        companyUpdate.phone = customerPhone;
        companyUpdate.whatsapp = customerPhone;
      }
      if (email) {
        companyUpdate.email = email;
      }
      await supabase.from('companies').update(companyUpdate).eq('id', companyId);
    }

    let shouldSendEmail = !hadPaidSubscription;
    if (checkout?.id) {
      shouldSendEmail = shouldSendEmail && checkout?.status !== 'completed';
      await supabase.from('subscription_checkouts').update({
        status: 'completed',
        cakto_subscription_id: caktoSubId,
        user_id: userId,
        company_id: companyId,
      }).eq('id', checkout.id);
    }

    const appUrl =
      Deno.env.get('APP_PUBLIC_URL') ??
      metadata?.app_url ??
      data?.app_url ??
      'https://ideartcloud.com.br';
    if (appUrl && shouldSendEmail) {
      if (userId) {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            has_active_subscription: true,
            trial_active: false,
          },
        });
      }
      await sendAccessEmail({
        email,
        fullName: checkout?.full_name ?? customerName ?? null,
        password: tempPassword,
        appUrl,
        companyName: checkout?.company_name ?? companyName ?? null,
        planName: planInfo?.name ?? null,
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
