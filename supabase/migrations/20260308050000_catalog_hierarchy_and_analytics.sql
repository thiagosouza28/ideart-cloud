alter table public.categories
  add column if not exists icon_name text,
  add column if not exists icon_url text,
  add column if not exists order_position integer not null default 0;

create index if not exists categories_company_parent_order_idx
  on public.categories(company_id, parent_id, order_position, name);

with ordered as (
  select
    id,
    row_number() over (
      partition by company_id, parent_id
      order by order_position asc, lower(name) asc, created_at asc
    ) - 1 as next_order
  from public.categories
)
update public.categories c
set order_position = ordered.next_order
from ordered
where ordered.id = c.id;

alter table public.products
  add column if not exists sales_count integer not null default 0,
  add column if not exists view_count integer not null default 0;

create index if not exists products_company_sales_count_idx
  on public.products(company_id, sales_count desc, created_at desc);

create index if not exists products_company_view_count_idx
  on public.products(company_id, view_count desc, created_at desc);

create or replace function public.recalculate_product_sales_counts(p_company_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with valid_orders as (
    select id
    from public.orders
    where status not in ('orcamento', 'pendente', 'cancelado')
      and (p_company_id is null or company_id = p_company_id)
  ),
  order_totals as (
    select oi.product_id, sum(coalesce(oi.quantity, 0))::integer as total_quantity
    from public.order_items oi
    join valid_orders vo on vo.id = oi.order_id
    where oi.product_id is not null
    group by oi.product_id
  ),
  sale_totals as (
    select si.product_id, sum(coalesce(si.quantity, 0))::integer as total_quantity
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.product_id is not null
      and (p_company_id is null or s.company_id = p_company_id)
    group by si.product_id
  ),
  merged as (
    select
      p.id as product_id,
      coalesce(order_totals.total_quantity, 0) + coalesce(sale_totals.total_quantity, 0) as total_sales
    from public.products p
    left join order_totals on order_totals.product_id = p.id
    left join sale_totals on sale_totals.product_id = p.id
    where p_company_id is null or p.company_id = p_company_id
  )
  update public.products p
  set sales_count = coalesce(merged.total_sales, 0)
  from merged
  where merged.product_id = p.id;
end;
$$;

select public.recalculate_product_sales_counts(null);

create table if not exists public.product_view_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  session_key text null,
  viewed_at timestamptz not null default now()
);

create index if not exists product_view_history_company_viewed_idx
  on public.product_view_history(company_id, viewed_at desc);

create index if not exists product_view_history_product_viewed_idx
  on public.product_view_history(product_id, viewed_at desc);

create index if not exists product_view_history_user_viewed_idx
  on public.product_view_history(user_id, viewed_at desc);

create table if not exists public.catalog_event_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  session_key text null,
  event_type text not null check (
    event_type in ('view_product', 'add_to_cart', 'start_order', 'purchase_completed')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists catalog_event_logs_company_created_idx
  on public.catalog_event_logs(company_id, created_at desc);

create index if not exists catalog_event_logs_product_created_idx
  on public.catalog_event_logs(product_id, created_at desc);

create index if not exists catalog_event_logs_type_created_idx
  on public.catalog_event_logs(event_type, created_at desc);

create or replace function public.bump_product_view_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set view_count = coalesce(view_count, 0) + 1
  where id = new.product_id;

  return new;
end;
$$;

drop trigger if exists bump_product_view_count_after_insert on public.product_view_history;
create trigger bump_product_view_count_after_insert
after insert on public.product_view_history
for each row
execute function public.bump_product_view_count();

alter table public.product_view_history enable row level security;
alter table public.catalog_event_logs enable row level security;

drop policy if exists "Public insert product view history" on public.product_view_history;
create policy "Public insert product view history"
  on public.product_view_history
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_view_history.product_id
        and p.company_id = product_view_history.company_id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or coalesce(p.show_in_catalog, false) = true)
    )
  );

drop policy if exists "Company users view product view history" on public.product_view_history;
create policy "Company users view product view history"
  on public.product_view_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.company_id = product_view_history.company_id
    )
  );

drop policy if exists "Public insert catalog events" on public.catalog_event_logs;
create policy "Public insert catalog events"
  on public.catalog_event_logs
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = catalog_event_logs.company_id
        and c.is_active = true
    )
    and (
      catalog_event_logs.product_id is null
      or exists (
        select 1
        from public.products p
        where p.id = catalog_event_logs.product_id
          and p.company_id = catalog_event_logs.company_id
      )
    )
  );

drop policy if exists "Company users view catalog events" on public.catalog_event_logs;
create policy "Company users view catalog events"
  on public.catalog_event_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.company_id = catalog_event_logs.company_id
    )
  );

drop policy if exists "Categories select from catalog products" on public.categories;
create policy "Categories select from catalog products"
  on public.categories
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.category_id = categories.id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or coalesce(p.show_in_catalog, false) = true)
    )
  );

drop policy if exists "Attributes select from catalog products" on public.attributes;
create policy "Attributes select from catalog products"
  on public.attributes
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.attribute_values av
      join public.product_attributes pa on pa.attribute_value_id = av.id
      join public.products p on p.id = pa.product_id
      where av.attribute_id = attributes.id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or coalesce(p.show_in_catalog, false) = true)
    )
  );

drop policy if exists "Attribute values select from catalog products" on public.attribute_values;
create policy "Attribute values select from catalog products"
  on public.attribute_values
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.product_attributes pa
      join public.products p on p.id = pa.product_id
      where pa.attribute_value_id = attribute_values.id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or coalesce(p.show_in_catalog, false) = true)
    )
  );

drop policy if exists "Product attributes select from catalog products" on public.product_attributes;
create policy "Product attributes select from catalog products"
  on public.product_attributes
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_attributes.product_id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or coalesce(p.show_in_catalog, false) = true)
    )
  );
