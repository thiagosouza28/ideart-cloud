create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type public.payment_method not null,
  fee_percentage numeric(10,2) not null default 0,
  is_active boolean not null default true,
  description text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_company_type_key unique (company_id, type),
  constraint payment_methods_name_check check (char_length(trim(name)) > 0),
  constraint payment_methods_fee_percentage_check check (fee_percentage >= 0)
);

create index if not exists payment_methods_company_active_idx
  on public.payment_methods(company_id, is_active, sort_order, name);

alter table public.payment_methods enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_methods'
      and policyname = 'Payment methods same company select'
  ) then
    create policy "Payment methods same company select"
      on public.payment_methods
      for select
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_methods'
      and policyname = 'Payment methods same company manage'
  ) then
    create policy "Payment methods same company manage"
      on public.payment_methods
      for all
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      )
      with check (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;
end $$;

drop trigger if exists update_payment_methods_updated_at on public.payment_methods;
create trigger update_payment_methods_updated_at
before update on public.payment_methods
for each row
execute function public.update_updated_at_column();

create or replace function public.seed_default_payment_methods(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_company_id is null then
    return;
  end if;

  insert into public.payment_methods (
    company_id,
    name,
    type,
    fee_percentage,
    is_active,
    description,
    sort_order
  )
  values
    (p_company_id, 'Dinheiro', 'dinheiro'::public.payment_method, 0, true, 'Recebimento em dinheiro.', 10),
    (p_company_id, 'Cartão', 'cartao'::public.payment_method, 0, true, 'Cartão em cobrança única.', 20),
    (p_company_id, 'Cartão de crédito', 'credito'::public.payment_method, 0, true, 'Cobrança no crédito.', 30),
    (p_company_id, 'Cartão de débito', 'debito'::public.payment_method, 0, true, 'Cobrança no débito.', 40),
    (p_company_id, 'Pix', 'pix'::public.payment_method, 0, true, 'Pagamento via PIX.', 50),
    (p_company_id, 'Boleto', 'boleto'::public.payment_method, 0, false, 'Cobrança via boleto.', 60),
    (p_company_id, 'Transferência', 'transferencia'::public.payment_method, 0, true, 'Transferência bancária.', 70),
    (p_company_id, 'Outros', 'outro'::public.payment_method, 0, true, 'Outras formas de pagamento.', 80)
  on conflict (company_id, type) do nothing;
end;
$$;

select public.seed_default_payment_methods(c.id)
from public.companies c;

create or replace function public.ensure_company_payment_methods_on_companies()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.seed_default_payment_methods(new.id);
  return new;
end;
$$;

drop trigger if exists ensure_company_payment_methods_on_companies on public.companies;
create trigger ensure_company_payment_methods_on_companies
after insert on public.companies
for each row
execute function public.ensure_company_payment_methods_on_companies();

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  description text null,
  item_kind text not null default 'item',
  base_price numeric(10,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_items_name_check check (char_length(trim(name)) > 0),
  constraint service_items_kind_check check (item_kind in ('item', 'adicional')),
  constraint service_items_base_price_check check (base_price >= 0)
);

create index if not exists service_items_service_product_idx
  on public.service_items(service_product_id, sort_order, created_at);

alter table public.service_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_items'
      and policyname = 'Service items same company select'
  ) then
    create policy "Service items same company select"
      on public.service_items
      for select
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_items'
      and policyname = 'Service items same company manage'
  ) then
    create policy "Service items same company manage"
      on public.service_items
      for all
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      )
      with check (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;
end $$;

drop trigger if exists update_service_items_updated_at on public.service_items;
create trigger update_service_items_updated_at
before update on public.service_items
for each row
execute function public.update_updated_at_column();

create table if not exists public.service_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_product_id uuid not null references public.products(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(10,2) not null default 1,
  notes text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_products_quantity_check check (quantity > 0)
);

create index if not exists service_products_service_product_idx
  on public.service_products(service_product_id, sort_order, created_at);

alter table public.service_products enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_products'
      and policyname = 'Service products same company select'
  ) then
    create policy "Service products same company select"
      on public.service_products
      for select
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_products'
      and policyname = 'Service products same company manage'
  ) then
    create policy "Service products same company manage"
      on public.service_products
      for all
      to authenticated
      using (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      )
      with check (
        company_id = (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
      );
  end if;
end $$;

drop trigger if exists update_service_products_updated_at on public.service_products;
create trigger update_service_products_updated_at
before update on public.service_products
for each row
execute function public.update_updated_at_column();

alter table public.products
  add column if not exists service_base_price numeric(10,2) not null default 0;

alter table public.order_art_files
  add column if not exists customer_id uuid null references public.customers(id) on delete set null;

create index if not exists order_art_files_customer_id_idx
  on public.order_art_files(customer_id, created_at desc);

create or replace function public.assign_order_art_file_customer_id()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.customer_id is null then
    select o.customer_id
      into new.customer_id
    from public.orders o
    where o.id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_order_art_file_customer_id on public.order_art_files;
create trigger assign_order_art_file_customer_id
before insert on public.order_art_files
for each row
execute function public.assign_order_art_file_customer_id();

update public.order_art_files af
set customer_id = o.customer_id
from public.orders o
where o.id = af.order_id
  and af.customer_id is null;

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
  v_catalog_payment_methods public.payment_method[] := array[
    'pix'::public.payment_method,
    'dinheiro'::public.payment_method,
    'credito'::public.payment_method,
    'debito'::public.payment_method,
    'transferencia'::public.payment_method,
    'outro'::public.payment_method
  ];
  v_payment_methods public.payment_method[] := array[]::public.payment_method[];
  v_payment_method_details jsonb := '[]'::jsonb;
begin
  select
    true,
    c.pix_gateway,
    coalesce(
      cs.accepted_payment_methods,
      array[
        'pix'::public.payment_method,
        'dinheiro'::public.payment_method,
        'credito'::public.payment_method,
        'debito'::public.payment_method,
        'transferencia'::public.payment_method,
        'outro'::public.payment_method
      ]
    )
  into
    v_company_exists,
    v_pix_gateway,
    v_catalog_payment_methods
  from public.companies c
  left join public.catalog_settings cs on cs.store_id = c.id
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    return jsonb_build_object(
      'company_exists', false,
      'has_access', false,
      'pix_available', false,
      'pix_gateway', null,
      'payment_methods', '[]'::jsonb,
      'payment_method_details', '[]'::jsonb
    );
  end if;

  v_has_access := public.company_has_active_access(p_company_id);
  v_pix_available := v_has_access and public.company_pix_is_ready(p_company_id);

  if v_has_access then
    select
      coalesce(array_agg(pm.type order by pm.sort_order, pm.name), array[]::public.payment_method[]),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'type', pm.type,
            'name', pm.name,
            'description', pm.description,
            'fee_percentage', pm.fee_percentage
          )
          order by pm.sort_order, pm.name
        ),
        '[]'::jsonb
      )
    into
      v_payment_methods,
      v_payment_method_details
    from public.payment_methods pm
    where pm.company_id = p_company_id
      and pm.is_active = true
      and pm.type = any(v_catalog_payment_methods)
      and pm.type = any(
        array[
          'pix'::public.payment_method,
          'dinheiro'::public.payment_method,
          'credito'::public.payment_method,
          'debito'::public.payment_method,
          'transferencia'::public.payment_method,
          'outro'::public.payment_method
        ]
      )
      and (
        pm.type <> 'pix'::public.payment_method
        or v_pix_available
      );
  end if;

  if coalesce(array_length(v_payment_methods, 1), 0) = 0 and v_has_access then
    v_payment_methods := v_catalog_payment_methods;

    if not v_pix_available then
      v_payment_methods := array_remove(v_payment_methods, 'pix'::public.payment_method);
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type', method,
          'name',
            case method
              when 'pix'::public.payment_method then 'Pix'
              when 'dinheiro'::public.payment_method then 'Dinheiro'
              when 'credito'::public.payment_method then 'Cartão de crédito'
              when 'debito'::public.payment_method then 'Cartão de débito'
              when 'transferencia'::public.payment_method then 'Transferência'
              else 'Outros'
            end,
          'description', null,
          'fee_percentage', 0
        )
        order by ord
      ),
      '[]'::jsonb
    )
    into v_payment_method_details
    from unnest(v_payment_methods) with ordinality as checkout_methods(method, ord);
  end if;

  if not v_has_access then
    v_payment_methods := array[]::public.payment_method[];
    v_payment_method_details := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'company_exists', v_company_exists,
    'has_access', v_has_access,
    'pix_available', v_pix_available,
    'pix_gateway', case when v_pix_available then v_pix_gateway else null end,
    'payment_methods', to_jsonb(v_payment_methods),
    'payment_method_details', v_payment_method_details
  );
end;
$$;

grant execute on function public.seed_default_payment_methods(uuid) to authenticated;
grant execute on function public.get_company_checkout_payment_options(uuid) to anon, authenticated;
