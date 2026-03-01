-- Creates/updates the onboarding company in a controlled security-definer function,
-- avoiding client-side RLS insert failures on public.companies.

create or replace function public.complete_onboarding_company(
  p_name text,
  p_slug text,
  p_phone text,
  p_whatsapp text,
  p_address text,
  p_city text,
  p_state text,
  p_email text default null,
  p_document text default null,
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_now timestamptz := now();
  v_trial_end timestamptz := coalesce(p_trial_ends_at, now() + interval '3 days');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Company name is required';
  end if;

  if nullif(trim(coalesce(p_slug, '')), '') is null then
    raise exception 'Company slug is required';
  end if;

  select p.company_id
    into v_company_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if v_company_id is null then
    insert into public.companies (
      name,
      slug,
      phone,
      whatsapp,
      address,
      city,
      state,
      email,
      document,
      completed,
      is_active,
      subscription_status,
      subscription_start_date,
      subscription_end_date,
      trial_active,
      trial_ends_at,
      owner_user_id
    )
    values (
      trim(p_name),
      trim(p_slug),
      nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_whatsapp, '')), ''),
      nullif(trim(coalesce(p_address, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_state, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_document, '')), ''),
      true,
      true,
      'trial',
      v_now,
      v_trial_end,
      true,
      v_trial_end,
      v_user_id
    )
    returning id into v_company_id;

    insert into public.company_users (company_id, user_id)
    values (v_company_id, v_user_id)
    on conflict (company_id, user_id) do nothing;
  else
    update public.companies
    set
      name = trim(p_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      whatsapp = nullif(trim(coalesce(p_whatsapp, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      city = nullif(trim(coalesce(p_city, '')), ''),
      state = nullif(trim(coalesce(p_state, '')), ''),
      email = nullif(trim(coalesce(p_email, '')), ''),
      document = nullif(trim(coalesce(p_document, '')), ''),
      completed = true,
      owner_user_id = coalesce(owner_user_id, v_user_id)
    where id = v_company_id;

    insert into public.company_users (company_id, user_id)
    values (v_company_id, v_user_id)
    on conflict (company_id, user_id) do nothing;
  end if;

  update public.profiles
  set
    company_id = v_company_id,
    must_complete_onboarding = false,
    must_complete_company = false,
    updated_at = now()
  where id = v_user_id;

  if not exists (
    select 1
    from public.subscriptions s
    where s.company_id = v_company_id
  ) then
    insert into public.subscriptions (
      user_id,
      company_id,
      plan_id,
      status,
      trial_ends_at,
      current_period_ends_at,
      gateway
    )
    values (
      v_user_id,
      v_company_id,
      null,
      'trial',
      v_trial_end,
      v_trial_end,
      'trial'
    );
  end if;

  return v_company_id;
end;
$$;

grant execute on function public.complete_onboarding_company(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to authenticated;
