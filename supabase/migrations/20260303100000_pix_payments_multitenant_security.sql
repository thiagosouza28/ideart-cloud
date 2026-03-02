-- PIX configuration, secure payment tokens, plan limits, webhook logs, and checkout guards.

-- ---------------------------------------------------------------------------
-- Companies: PIX settings (public-facing) + masked token columns (never raw).
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists pix_enabled boolean not null default false,
  add column if not exists pix_gateway text,
  add column if not exists pix_key_type text,
  add column if not exists pix_key text,
  add column if not exists pix_beneficiary_name text,
  add column if not exists mp_access_token text,
  add column if not exists pagseguro_token text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_pix_gateway_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_pix_gateway_check
      check (
        pix_gateway is null
        or pix_gateway in ('MercadoPago', 'PagSeguro', 'PixManual')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_pix_key_type_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_pix_key_type_check
      check (
        pix_key_type is null
        or pix_key_type in ('CPF', 'CNPJ', 'Email', 'Telefone', 'ChaveAleatoria')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Plans: explicit limits per plan.
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists max_orders_per_month integer,
  add column if not exists max_products integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_max_orders_per_month_non_negative'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_max_orders_per_month_non_negative
      check (max_orders_per_month is null or max_orders_per_month >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_max_products_non_negative'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_max_products_non_negative
      check (max_products is null or max_products >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Orders: PIX payment artifacts.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_id text,
  add column if not exists payment_qr_code text,
  add column if not exists payment_copy_paste text,
  add column if not exists paid_at timestamptz;

create index if not exists orders_payment_id_idx
  on public.orders (payment_id)
  where payment_id is not null;

update public.orders o
set paid_at = x.max_paid_at
from (
  select op.order_id, max(op.paid_at) as max_paid_at
  from public.order_payments op
  where op.paid_at is not null
  group by op.order_id
) as x
where o.id = x.order_id
  and o.paid_at is null;

-- ---------------------------------------------------------------------------
-- Backend-only payment tokens (raw secrets).
-- ---------------------------------------------------------------------------
create table if not exists public.company_payment_tokens (
  company_id uuid primary key references public.companies(id) on delete cascade,
  mp_access_token text,
  pagseguro_token text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_payment_tokens_updated_at_idx
  on public.company_payment_tokens (updated_at desc);

alter table public.company_payment_tokens enable row level security;

drop policy if exists "No direct access to payment tokens" on public.company_payment_tokens;
create policy "No direct access to payment tokens"
  on public.company_payment_tokens
  for all
  to authenticated
  using (false)
  with check (false);

do $$
begin
  if to_regprocedure('public.update_updated_at()') is not null then
    drop trigger if exists set_company_payment_tokens_updated_at on public.company_payment_tokens;
    create trigger set_company_payment_tokens_updated_at
    before update on public.company_payment_tokens
    for each row
    execute function public.update_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Webhook logs by company (visible only to store admins/finance).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  gateway text not null,
  event_type text,
  external_event_id text,
  payment_id text,
  status text,
  payload jsonb,
  signature_valid boolean,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payment_webhook_logs_company_received_idx
  on public.payment_webhook_logs (company_id, received_at desc);

create index if not exists payment_webhook_logs_payment_id_idx
  on public.payment_webhook_logs (payment_id)
  where payment_id is not null;

alter table public.payment_webhook_logs enable row level security;

drop policy if exists "Payment webhook logs by company" on public.payment_webhook_logs;
create policy "Payment webhook logs by company"
  on public.payment_webhook_logs
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers: subscription access, plan limits, PIX readiness.
-- ---------------------------------------------------------------------------
create or replace function public.company_has_active_access(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_status text;
  v_end_date timestamptz;
  v_trial_end timestamptz;
  v_created_at timestamptz;
  v_expires_at timestamptz;
begin
  select
    lower(coalesce(c.subscription_status, '')),
    c.subscription_end_date,
    c.trial_ends_at,
    c.created_at
  into
    v_status,
    v_end_date,
    v_trial_end,
    v_created_at
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    return false;
  end if;

  v_expires_at := coalesce(
    v_end_date,
    v_trial_end,
    case when v_status = 'trial' then v_created_at + interval '3 days' else null end
  );

  if v_status in ('expired', 'past_due', 'unpaid', 'incomplete', 'canceled', 'cancelled') then
    return false;
  end if;

  if v_status in ('trial', 'active') then
    return v_expires_at is null or v_expires_at >= now();
  end if;

  -- Backward compatibility for legacy rows without explicit status.
  return true;
end;
$$;

create or replace function public.assert_company_order_limit(p_company_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select p.max_orders_per_month
    into v_limit
  from public.companies c
  left join public.plans p on p.id = c.plan_id
  where c.id = p_company_id;

  if v_limit is null or v_limit <= 0 then
    return;
  end if;

  select count(*)
    into v_count
  from public.orders o
  where o.company_id = p_company_id
    and o.created_at >= date_trunc('month', now())
    and o.created_at < (date_trunc('month', now()) + interval '1 month')
    and coalesce(o.status, 'pendente') <> 'cancelado';

  if v_count >= v_limit then
    raise exception 'Plan order limit reached for this month'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.company_pix_is_ready(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_enabled boolean;
  v_gateway text;
  v_key text;
  v_key_type text;
  v_beneficiary text;
  v_mp_token text;
  v_ps_token text;
begin
  select
    c.pix_enabled,
    c.pix_gateway,
    c.pix_key,
    c.pix_key_type,
    c.pix_beneficiary_name
  into
    v_enabled,
    v_gateway,
    v_key,
    v_key_type,
    v_beneficiary
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    return false;
  end if;

  if coalesce(v_enabled, false) is false then
    return false;
  end if;

  if v_gateway is null then
    return false;
  end if;

  select
    nullif(trim(coalesce(t.mp_access_token, '')), ''),
    nullif(trim(coalesce(t.pagseguro_token, '')), '')
  into
    v_mp_token,
    v_ps_token
  from public.company_payment_tokens t
  where t.company_id = p_company_id;

  if v_gateway = 'PixManual' then
    return nullif(trim(coalesce(v_key, '')), '') is not null
      and nullif(trim(coalesce(v_key_type, '')), '') is not null
      and nullif(trim(coalesce(v_beneficiary, '')), '') is not null;
  end if;

  if v_gateway = 'MercadoPago' then
    return v_mp_token is not null;
  end if;

  if v_gateway = 'PagSeguro' then
    return v_ps_token is not null;
  end if;

  return false;
end;
$$;

create or replace function public.get_company_checkout_payment_options(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company_exists boolean := false;
  v_has_access boolean := false;
  v_pix_available boolean := false;
  v_pix_gateway text := null;
begin
  select true, c.pix_gateway
    into v_company_exists, v_pix_gateway
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    return jsonb_build_object(
      'company_exists', false,
      'has_access', false,
      'pix_available', false,
      'pix_gateway', null
    );
  end if;

  v_has_access := public.company_has_active_access(p_company_id);
  v_pix_available := v_has_access and public.company_pix_is_ready(p_company_id);

  return jsonb_build_object(
    'company_exists', v_company_exists,
    'has_access', v_has_access,
    'pix_available', v_pix_available,
    'pix_gateway', case when v_pix_available then v_pix_gateway else null end
  );
end;
$$;

grant execute on function public.company_has_active_access(uuid) to anon, authenticated;
grant execute on function public.assert_company_order_limit(uuid) to authenticated;
grant execute on function public.company_pix_is_ready(uuid) to anon, authenticated;
grant execute on function public.get_company_checkout_payment_options(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plan limit on products.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_plan_product_limit()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_limit integer;
  v_count integer;
begin
  v_company_id := coalesce(new.company_id, old.company_id);

  if v_company_id is null then
    return new;
  end if;

  select p.max_products
    into v_limit
  from public.companies c
  left join public.plans p on p.id = c.plan_id
  where c.id = v_company_id;

  if v_limit is null or v_limit <= 0 then
    return new;
  end if;

  select count(*)
    into v_count
  from public.products pr
  where pr.company_id = v_company_id
    and (
      tg_op <> 'UPDATE'
      or pr.id <> new.id
    );

  if v_count >= v_limit then
    raise exception 'Plan product limit reached'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_plan_product_limit_on_products on public.products;
create trigger enforce_plan_product_limit_on_products
before insert or update of company_id on public.products
for each row
execute function public.enforce_plan_product_limit();

-- ---------------------------------------------------------------------------
-- Public order creation: enforce subscription/plan/PIX readiness.
-- ---------------------------------------------------------------------------
create or replace function public.create_public_order(
  p_company_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_document text,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_customer_email text default null,
  p_customer_address text default null,
  p_customer_city text default null,
  p_customer_state text default null,
  p_customer_zip_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_order_number integer;
  v_customer_id uuid;
  v_existing_customer_id uuid;
  v_customer_user_id uuid := auth.uid();
  v_min_order numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_token text;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(10,2);
  v_item_notes text;
  v_product record;
  v_unit_price numeric(10,2);
  v_customer_email text := nullif(trim(coalesce(p_customer_email, '')), '');
  v_customer_address text := nullif(trim(coalesce(p_customer_address, '')), '');
  v_customer_city text := nullif(trim(coalesce(p_customer_city, '')), '');
  v_customer_state text := nullif(trim(coalesce(p_customer_state, '')), '');
  v_customer_zip_code text := nullif(trim(coalesce(p_customer_zip_code, '')), '');
  v_pix_gateway text;
begin
  if p_company_id is null then
    raise exception 'Company is required';
  end if;

  select coalesce(c.minimum_order_value, 0), c.pix_gateway
    into v_min_order, v_pix_gateway
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    raise exception 'Company not found';
  end if;

  if not public.company_has_active_access(p_company_id) then
    raise exception 'Company access blocked';
  end if;

  perform public.assert_company_order_limit(p_company_id);

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) = 0 then
    raise exception 'Customer phone is required';
  end if;

  if p_customer_document is null or length(trim(p_customer_document)) = 0 then
    raise exception 'Customer document is required';
  end if;

  if p_payment_method is null then
    raise exception 'Payment method is required';
  end if;

  if p_payment_method = 'pix'::public.payment_method and not public.company_pix_is_ready(p_company_id) then
    raise exception 'PIX unavailable for this company';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Items are required';
  end if;

  if v_customer_user_id is not null then
    select c.id
      into v_existing_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and c.user_id = v_customer_user_id
    order by c.updated_at desc nulls last
    limit 1;
  end if;

  if v_existing_customer_id is not null then
    update public.customers
    set name = trim(p_customer_name),
        phone = trim(p_customer_phone),
        document = trim(p_customer_document),
        email = v_customer_email,
        address = v_customer_address,
        city = v_customer_city,
        state = v_customer_state,
        zip_code = v_customer_zip_code,
        user_id = v_customer_user_id,
        updated_at = now()
    where id = v_existing_customer_id
    returning id into v_customer_id;
  else
    insert into public.customers (
      name,
      phone,
      document,
      email,
      address,
      city,
      state,
      zip_code,
      user_id,
      company_id
    ) values (
      trim(p_customer_name),
      trim(p_customer_phone),
      trim(p_customer_document),
      v_customer_email,
      v_customer_address,
      v_customer_city,
      v_customer_state,
      v_customer_zip_code,
      v_customer_user_id,
      p_company_id
    )
    returning id into v_customer_id;
  end if;

  insert into public.orders (
    company_id,
    customer_id,
    customer_user_id,
    customer_name,
    status,
    subtotal,
    discount,
    total,
    payment_method,
    payment_status,
    amount_paid,
    created_by,
    gateway,
    payment_id,
    payment_qr_code,
    payment_copy_paste,
    paid_at
  ) values (
    p_company_id,
    v_customer_id,
    v_customer_user_id,
    trim(p_customer_name),
    'pendente',
    0,
    0,
    0,
    p_payment_method,
    'pendente',
    0,
    null,
    case when p_payment_method = 'pix'::public.payment_method then v_pix_gateway else null end,
    null,
    null,
    null,
    null
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_item_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    if v_product_id is null or v_quantity <= 0 then
      raise exception 'Invalid item';
    end if;

    select
      id,
      name,
      final_price,
      catalog_price,
      promo_price,
      promo_start_at,
      promo_end_at,
      min_order_quantity,
      base_cost,
      labor_cost,
      waste_percentage,
      profit_margin
      into v_product
    from public.products
    where id = v_product_id
      and company_id = p_company_id
      and (show_in_catalog = true or coalesce(catalog_enabled, false) = true)
      and is_active = true;

    if not found then
      raise exception 'Invalid product';
    end if;

    if v_quantity < coalesce(v_product.min_order_quantity, 1) then
      raise exception 'Minimum quantity not reached';
    end if;

    if v_product.promo_price is not null
      and (v_product.promo_start_at is null or now() >= v_product.promo_start_at)
      and (v_product.promo_end_at is null or now() <= v_product.promo_end_at) then
      v_unit_price := v_product.promo_price;
    elsif v_product.catalog_price is not null then
      v_unit_price := v_product.catalog_price;
    elsif v_product.final_price is not null then
      v_unit_price := v_product.final_price;
    else
      v_unit_price := (
        (
          coalesce(v_product.base_cost, 0)
          + coalesce(v_product.labor_cost, 0)
        )
        * (1 + coalesce(v_product.waste_percentage, 0) / 100)
        * (1 + coalesce(v_product.profit_margin, 0) / 100)
      );
    end if;

    v_unit_price := round(coalesce(v_unit_price, 0)::numeric, 2);
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      discount,
      total,
      attributes,
      notes
    ) values (
      v_order_id,
      v_product_id,
      v_product.name,
      v_quantity,
      v_unit_price,
      0,
      v_unit_price * v_quantity,
      null,
      v_item_notes
    );
  end loop;

  v_total := v_subtotal - v_discount;

  if v_min_order > 0 and v_total < v_min_order then
    raise exception 'Minimum order value not reached';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_total
  where id = v_order_id;

  insert into public.order_status_history (order_id, status, notes, user_id)
  values (v_order_id, 'pendente', 'Order created via public catalog', null);

  insert into public.order_public_links (order_id)
  values (v_order_id)
  on conflict (order_id) do update
  set order_id = excluded.order_id
  returning token into v_token;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'public_token', v_token
  );
end $$;

grant execute on function public.create_public_order(
  uuid,
  text,
  text,
  text,
  public.payment_method,
  jsonb,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public order payload: include PIX details.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  result jsonb;
begin
  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'total', o.total,
      'payment_status', o.payment_status,
      'payment_method', o.payment_method,
      'amount_paid', o.amount_paid,
      'gateway', to_jsonb(o) -> 'gateway',
      'gateway_order_id', to_jsonb(o) -> 'gateway_order_id',
      'payment_link_id', to_jsonb(o) -> 'payment_link_id',
      'payment_link_url', to_jsonb(o) -> 'payment_link_url',
      'payment_id', to_jsonb(o) -> 'payment_id',
      'payment_qr_code', to_jsonb(o) -> 'payment_qr_code',
      'payment_copy_paste', to_jsonb(o) -> 'payment_copy_paste',
      'paid_at', to_jsonb(o) -> 'paid_at',
      'notes', o.notes,
      'created_at', o.created_at,
      'approved_at', o.approved_at
    ),
    'customer', jsonb_build_object(
      'name', coalesce(c.name, o.customer_name),
      'document', c.document,
      'phone', c.phone,
      'email', c.email
    ),
    'company', jsonb_build_object(
      'name', co.name,
      'logo_url', co.logo_url,
      'phone', co.phone,
      'whatsapp', co.whatsapp,
      'email', co.email,
      'address', co.address,
      'city', co.city,
      'state', co.state
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'discount', oi.discount,
        'total', oi.total,
        'attributes', oi.attributes,
        'notes', oi.notes,
        'created_at', oi.created_at
      ))
      from public.order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'status', h.status,
        'notes', h.notes,
        'created_at', h.created_at
      ) order by h.created_at desc)
      from public.order_status_history h
      where h.order_id = o.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'amount', p.amount,
        'status', p.status,
        'method', p.method,
        'paid_at', p.paid_at,
        'created_at', p.created_at,
        'notes', p.notes,
        'gateway', to_jsonb(p) -> 'gateway',
        'gateway_order_id', to_jsonb(p) -> 'gateway_order_id',
        'gateway_transaction_id', to_jsonb(p) -> 'gateway_transaction_id',
        'raw_payload', to_jsonb(p) -> 'raw_payload'
      ) order by p.created_at desc)
      from public.order_payments p
      where p.order_id = o.id
    ), '[]'::jsonb),
    'final_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'order_id', f.order_id,
        'storage_path', f.storage_path,
        'created_by', f.created_by,
        'created_at', f.created_at
      ) order by f.created_at desc)
      from public.order_final_photos f
      where f.order_id = o.id
    ), '[]'::jsonb),
    'art_files', case
      when o.status in (
        'produzindo_arte',
        'arte_aprovada',
        'em_producao',
        'finalizado',
        'pronto',
        'aguardando_retirada',
        'entregue'
      ) then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', af.id,
          'order_id', af.order_id,
          'storage_path', af.storage_path,
          'file_name', af.file_name,
          'file_type', af.file_type,
          'created_by', af.created_by,
          'created_at', af.created_at
        ) order by af.created_at desc)
        from public.order_art_files af
        where af.order_id = o.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  into result
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join public.companies co on co.id = o.company_id
  where o.id = v_order_id;

  return result;
end $$;
