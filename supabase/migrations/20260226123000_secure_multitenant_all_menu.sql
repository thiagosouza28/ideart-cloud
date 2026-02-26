-- Harden multi-tenant isolation by company across core operational tables.
-- Goal: each authenticated user can only read/write data from their own company,
-- except super_admin.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.apply_current_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  return new;
end;
$$;

create or replace function public.path_root_uuid(p_path text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(coalesce(p_path, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 1)::uuid
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Schema alignment
-- ---------------------------------------------------------------------------

alter table public.categories
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.supplies
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.attributes
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.attribute_values
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists categories_company_id_idx on public.categories(company_id);
create index if not exists supplies_company_id_idx on public.supplies(company_id);
create index if not exists attributes_company_id_idx on public.attributes(company_id);
create index if not exists attribute_values_company_id_idx on public.attribute_values(company_id);
create index if not exists customers_company_id_idx on public.customers(company_id);

-- Product SKU must be unique per company (not globally).
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_sku_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products drop constraint products_sku_key;
  end if;
end $$;

create unique index if not exists products_company_id_sku_key
  on public.products (company_id, sku)
  where sku is not null;

-- ---------------------------------------------------------------------------
-- Backfill company_id and split legacy shared rows by company when needed
-- ---------------------------------------------------------------------------

-- Keep orders/sales aligned first.
update public.orders o
set company_id = p.company_id
from public.profiles p
where o.company_id is null
  and o.created_by = p.id
  and p.company_id is not null;

update public.sales s
set company_id = p.company_id
from public.profiles p
where s.company_id is null
  and s.user_id = p.id
  and p.company_id is not null;

-- Categories: split by product company usage.
create temporary table tmp_category_usage on commit drop as
select distinct p.category_id as old_id, p.company_id
from public.products p
where p.category_id is not null
  and p.company_id is not null;

with first_company as (
  select old_id, min(company_id::text)::uuid as company_id
  from tmp_category_usage
  group by old_id
)
update public.categories c
set company_id = fc.company_id
from first_company fc
where c.id = fc.old_id
  and c.company_id is null;

create temporary table tmp_category_remap (
  old_id uuid not null,
  company_id uuid not null,
  new_id uuid not null
) on commit drop;

insert into tmp_category_remap (old_id, company_id, new_id)
select u.old_id, u.company_id, gen_random_uuid()
from tmp_category_usage u
join public.categories c on c.id = u.old_id
where c.company_id is distinct from u.company_id;

insert into public.categories (id, name, parent_id, created_at, updated_at, company_id)
select
  r.new_id,
  c.name,
  coalesce(parent_map.new_id, c.parent_id),
  c.created_at,
  c.updated_at,
  r.company_id
from tmp_category_remap r
join public.categories c on c.id = r.old_id
left join tmp_category_remap parent_map
  on parent_map.old_id = c.parent_id
 and parent_map.company_id = r.company_id;

update public.products p
set category_id = r.new_id
from tmp_category_remap r
where p.category_id = r.old_id
  and p.company_id = r.company_id;

-- Supplies: split by product company usage.
create temporary table tmp_supply_usage on commit drop as
select distinct ps.supply_id as old_id, p.company_id
from public.product_supplies ps
join public.products p on p.id = ps.product_id
where p.company_id is not null;

with first_company as (
  select old_id, min(company_id::text)::uuid as company_id
  from tmp_supply_usage
  group by old_id
)
update public.supplies s
set company_id = fc.company_id
from first_company fc
where s.id = fc.old_id
  and s.company_id is null;

create temporary table tmp_supply_remap (
  old_id uuid not null,
  company_id uuid not null,
  new_id uuid not null
) on commit drop;

insert into tmp_supply_remap (old_id, company_id, new_id)
select u.old_id, u.company_id, gen_random_uuid()
from tmp_supply_usage u
join public.supplies s on s.id = u.old_id
where s.company_id is distinct from u.company_id;

insert into public.supplies (
  id, name, unit, cost_per_unit, stock_quantity, min_stock, created_at, updated_at, image_url, sale_price, company_id
)
select
  r.new_id,
  s.name,
  s.unit,
  s.cost_per_unit,
  s.stock_quantity,
  s.min_stock,
  s.created_at,
  s.updated_at,
  s.image_url,
  s.sale_price,
  r.company_id
from tmp_supply_remap r
join public.supplies s on s.id = r.old_id;

update public.product_supplies ps
set supply_id = r.new_id
from tmp_supply_remap r, public.products p
where ps.supply_id = r.old_id
  and p.id = ps.product_id
  and p.company_id = r.company_id;

-- Attributes and values: split by product company usage.
create temporary table tmp_attribute_usage on commit drop as
select distinct av.attribute_id as old_id, p.company_id
from public.product_attributes pa
join public.attribute_values av on av.id = pa.attribute_value_id
join public.products p on p.id = pa.product_id
where p.company_id is not null;

with first_company as (
  select old_id, min(company_id::text)::uuid as company_id
  from tmp_attribute_usage
  group by old_id
)
update public.attributes a
set company_id = fc.company_id
from first_company fc
where a.id = fc.old_id
  and a.company_id is null;

create temporary table tmp_attribute_remap (
  old_id uuid not null,
  company_id uuid not null,
  new_id uuid not null
) on commit drop;

insert into tmp_attribute_remap (old_id, company_id, new_id)
select u.old_id, u.company_id, gen_random_uuid()
from tmp_attribute_usage u
join public.attributes a on a.id = u.old_id
where a.company_id is distinct from u.company_id;

insert into public.attributes (id, name, created_at, company_id)
select
  r.new_id,
  a.name,
  a.created_at,
  r.company_id
from tmp_attribute_remap r
join public.attributes a on a.id = r.old_id;

create temporary table tmp_attribute_value_usage on commit drop as
select distinct pa.attribute_value_id as old_id, p.company_id
from public.product_attributes pa
join public.products p on p.id = pa.product_id
where p.company_id is not null;

with first_company as (
  select old_id, min(company_id::text)::uuid as company_id
  from tmp_attribute_value_usage
  group by old_id
)
update public.attribute_values av
set company_id = fc.company_id
from first_company fc
where av.id = fc.old_id
  and av.company_id is null;

-- Keep orphan values aligned with their attribute company when possible.
update public.attribute_values av
set company_id = a.company_id
from public.attributes a
where av.attribute_id = a.id
  and av.company_id is null
  and a.company_id is not null;

create temporary table tmp_attribute_value_remap (
  old_id uuid not null,
  company_id uuid not null,
  new_id uuid not null
) on commit drop;

insert into tmp_attribute_value_remap (old_id, company_id, new_id)
select u.old_id, u.company_id, gen_random_uuid()
from tmp_attribute_value_usage u
join public.attribute_values av on av.id = u.old_id
where av.company_id is distinct from u.company_id;

insert into public.attribute_values (id, attribute_id, value, created_at, company_id)
select
  r.new_id,
  coalesce(attr_map.new_id, av.attribute_id),
  av.value,
  av.created_at,
  r.company_id
from tmp_attribute_value_remap r
join public.attribute_values av on av.id = r.old_id
left join tmp_attribute_remap attr_map
  on attr_map.old_id = av.attribute_id
 and attr_map.company_id = r.company_id;

update public.product_attributes pa
set attribute_value_id = r.new_id
from tmp_attribute_value_remap r, public.products p
where pa.attribute_value_id = r.old_id
  and p.id = pa.product_id
  and p.company_id = r.company_id;

-- Customers: split by order/sale company usage.
create temporary table tmp_customer_usage on commit drop as
select distinct o.customer_id as old_id, o.company_id
from public.orders o
where o.customer_id is not null
  and o.company_id is not null
union
select distinct s.customer_id as old_id, s.company_id
from public.sales s
where s.customer_id is not null
  and s.company_id is not null;

with first_company as (
  select old_id, min(company_id::text)::uuid as company_id
  from tmp_customer_usage
  group by old_id
)
update public.customers c
set company_id = fc.company_id
from first_company fc
where c.id = fc.old_id
  and c.company_id is null;

create temporary table tmp_customer_remap (
  old_id uuid not null,
  company_id uuid not null,
  new_id uuid not null
) on commit drop;

insert into tmp_customer_remap (old_id, company_id, new_id)
select u.old_id, u.company_id, gen_random_uuid()
from tmp_customer_usage u
join public.customers c on c.id = u.old_id
where c.company_id is distinct from u.company_id;

insert into public.customers (
  id, name, document, email, phone, address, city, state, zip_code, notes, created_at, updated_at, date_of_birth, photo_url, company_id
)
select
  r.new_id,
  c.name,
  c.document,
  c.email,
  c.phone,
  c.address,
  c.city,
  c.state,
  c.zip_code,
  c.notes,
  c.created_at,
  c.updated_at,
  c.date_of_birth,
  c.photo_url,
  r.company_id
from tmp_customer_remap r
join public.customers c on c.id = r.old_id;

update public.orders o
set customer_id = r.new_id
from tmp_customer_remap r
where o.customer_id = r.old_id
  and o.company_id = r.company_id;

update public.sales s
set customer_id = r.new_id
from tmp_customer_remap r
where s.customer_id = r.old_id
  and s.company_id = r.company_id;

-- ---------------------------------------------------------------------------
-- Triggers: auto-fill company_id on inserts
-- ---------------------------------------------------------------------------

drop trigger if exists set_products_company_id on public.products;
create trigger set_products_company_id
before insert on public.products
for each row execute function public.apply_current_company_id();

drop trigger if exists set_orders_company_id on public.orders;
create trigger set_orders_company_id
before insert on public.orders
for each row execute function public.apply_current_company_id();

drop trigger if exists set_sales_company_id on public.sales;
create trigger set_sales_company_id
before insert on public.sales
for each row execute function public.apply_current_company_id();

drop trigger if exists set_customers_company_id on public.customers;
create trigger set_customers_company_id
before insert on public.customers
for each row execute function public.apply_current_company_id();

drop trigger if exists set_categories_company_id on public.categories;
create trigger set_categories_company_id
before insert on public.categories
for each row execute function public.apply_current_company_id();

drop trigger if exists set_supplies_company_id on public.supplies;
create trigger set_supplies_company_id
before insert on public.supplies
for each row execute function public.apply_current_company_id();

drop trigger if exists set_attributes_company_id on public.attributes;
create trigger set_attributes_company_id
before insert on public.attributes
for each row execute function public.apply_current_company_id();

drop trigger if exists set_attribute_values_company_id on public.attribute_values;
create trigger set_attribute_values_company_id
before insert on public.attribute_values
for each row execute function public.apply_current_company_id();

-- ---------------------------------------------------------------------------
-- Policies: replace permissive/global policies with company-scoped policies
-- ---------------------------------------------------------------------------

-- Categories
drop policy if exists "Authenticated can view categories" on public.categories;
drop policy if exists "Admin/Atendente can manage categories" on public.categories;
drop policy if exists "Categories by company" on public.categories;
drop policy if exists "Public can view catalog categories" on public.categories;

create policy "Categories by company"
  on public.categories
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

create policy "Public can view catalog categories"
  on public.categories
  for select
  to anon
  using (
    exists (
      select 1
      from public.products p
      where p.category_id = categories.id
        and p.is_active = true
        and (p.catalog_enabled = true or p.show_in_catalog = true)
    )
  );

-- Supplies
drop policy if exists "Authenticated can view supplies" on public.supplies;
drop policy if exists "Admin/Atendente can manage supplies" on public.supplies;
drop policy if exists "Supplies by company" on public.supplies;

create policy "Supplies by company"
  on public.supplies
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

-- Attributes
drop policy if exists "Authenticated can view attributes" on public.attributes;
drop policy if exists "Admin/Atendente can manage attributes" on public.attributes;
drop policy if exists "Attributes by company" on public.attributes;

create policy "Attributes by company"
  on public.attributes
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

-- Attribute values
drop policy if exists "Authenticated can view attribute_values" on public.attribute_values;
drop policy if exists "Admin/Atendente can manage attribute_values" on public.attribute_values;
drop policy if exists "Attribute values by company" on public.attribute_values;

create policy "Attribute values by company"
  on public.attribute_values
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and exists (
        select 1
        from public.attributes a
        where a.id = attribute_values.attribute_id
          and (
            public.has_role(auth.uid(), 'super_admin'::public.app_role)
            or a.company_id = public.current_company_id()
          )
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and exists (
        select 1
        from public.attributes a
        where a.id = attribute_values.attribute_id
          and (
            public.has_role(auth.uid(), 'super_admin'::public.app_role)
            or a.company_id = public.current_company_id()
          )
      )
    )
  );

-- Customers
drop policy if exists "Authenticated can view customers" on public.customers;
drop policy if exists "Admin/Atendente can manage customers" on public.customers;
drop policy if exists "Customers by company" on public.customers;

create policy "Customers by company"
  on public.customers
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

-- Orders
drop policy if exists "Authenticated can manage orders" on public.orders;
drop policy if exists "Authenticated can view orders" on public.orders;
drop policy if exists "Orders by company" on public.orders;

create policy "Orders by company"
  on public.orders
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

-- Order items
drop policy if exists "Authenticated can manage order_items" on public.order_items;
drop policy if exists "Authenticated can view order_items" on public.order_items;
drop policy if exists "Order items by company" on public.order_items;

create policy "Order items by company"
  on public.order_items
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- Order status history
drop policy if exists "Authenticated can insert order_status_history" on public.order_status_history;
drop policy if exists "Authenticated can view order_status_history" on public.order_status_history;
drop policy if exists "Order status history by company" on public.order_status_history;

create policy "Order status history by company"
  on public.order_status_history
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_status_history.order_id
        and o.company_id = public.current_company_id()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_status_history.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- Companies
drop policy if exists "Authenticated can view companies" on public.companies;
drop policy if exists "Admins can manage companies" on public.companies;
drop policy if exists "Companies own scope" on public.companies;

create policy "Companies own scope"
  on public.companies
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or id = public.current_company_id()
  );

-- Profiles
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Super admin can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Profiles by company and self" on public.profiles;
drop policy if exists "Profiles update by self/company admin" on public.profiles;

create policy "Profiles by company and self"
  on public.profiles
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or id = auth.uid()
    or company_id = public.current_company_id()
  );

create policy "Profiles update by self/company admin"
  on public.profiles
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or id = auth.uid()
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and (company_id = public.current_company_id() or company_id is null)
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or id = auth.uid()
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and (company_id = public.current_company_id() or company_id is null)
    )
  );

-- User roles
drop policy if exists "Admins can view all roles" on public.user_roles;
drop policy if exists "Admins can insert roles" on public.user_roles;
drop policy if exists "Admins can update roles" on public.user_roles;
drop policy if exists "Admins can delete roles" on public.user_roles;
drop policy if exists "Users can view own role" on public.user_roles;
drop policy if exists "User roles by company" on public.user_roles;
drop policy if exists "User roles insert by company admin" on public.user_roles;
drop policy if exists "User roles update by company admin" on public.user_roles;
drop policy if exists "User roles delete by company admin" on public.user_roles;

create policy "User roles by company"
  on public.user_roles
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or user_id = auth.uid()
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and exists (
        select 1
        from public.profiles p
        where p.id = user_roles.user_id
          and p.company_id = public.current_company_id()
      )
    )
  );

create policy "User roles insert by company admin"
  on public.user_roles
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and exists (
        select 1
        from public.profiles p
        where p.id = user_roles.user_id
          and p.company_id = public.current_company_id()
      )
    )
  );

create policy "User roles update by company admin"
  on public.user_roles
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and exists (
        select 1
        from public.profiles p
        where p.id = user_roles.user_id
          and p.company_id = public.current_company_id()
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and exists (
        select 1
        from public.profiles p
        where p.id = user_roles.user_id
          and p.company_id = public.current_company_id()
      )
    )
  );

create policy "User roles delete by company admin"
  on public.user_roles
  for delete
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and exists (
        select 1
        from public.profiles p
        where p.id = user_roles.user_id
          and p.company_id = public.current_company_id()
      )
    )
  );

-- Company users mapping table (ensure protected too)
alter table public.company_users enable row level security;

drop policy if exists "Company users by company" on public.company_users;
drop policy if exists "Company users manage by company admin" on public.company_users;

create policy "Company users by company"
  on public.company_users
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or user_id = auth.uid()
    or company_id = public.current_company_id()
  );

create policy "Company users manage by company admin"
  on public.company_users
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and company_id = public.current_company_id()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      and company_id = public.current_company_id()
    )
  );

-- Banners
drop policy if exists "Users can view their company banners" on public.banners;
drop policy if exists "Admins can manage their company banners" on public.banners;
drop policy if exists "Public can view active catalog banners" on public.banners;
drop policy if exists "Banners by company" on public.banners;
drop policy if exists "Banners manage by company admin" on public.banners;

create policy "Banners by company"
  on public.banners
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

create policy "Banners manage by company admin"
  on public.banners
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

create policy "Public can view active catalog banners"
  on public.banners
  for select
  to anon
  using (position = 'catalog' and is_active = true);

-- Order art files (Production/Kanban assets)
drop policy if exists "Authenticated can view order art files" on public.order_art_files;
drop policy if exists "Authenticated can insert order art files" on public.order_art_files;
drop policy if exists "Authenticated can delete order art files" on public.order_art_files;
drop policy if exists "Order art files by company" on public.order_art_files;

create policy "Order art files by company"
  on public.order_art_files
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_art_files.order_id
        and o.company_id = public.current_company_id()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_art_files.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- Order final photos (Production assets)
drop policy if exists "Authenticated can view order final photos" on public.order_final_photos;
drop policy if exists "Authenticated can insert order final photos" on public.order_final_photos;
drop policy if exists "Authenticated can delete order final photos" on public.order_final_photos;
drop policy if exists "Order final photos by company" on public.order_final_photos;

create policy "Order final photos by company"
  on public.order_final_photos
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_final_photos.order_id
        and o.company_id = public.current_company_id()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.orders o
      where o.id = order_final_photos.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- Storage object policies for order-art-files bucket
drop policy if exists "Authenticated can upload order art files" on storage.objects;
drop policy if exists "Authenticated can update order art files" on storage.objects;
drop policy if exists "Authenticated can delete order art files" on storage.objects;
drop policy if exists "Authenticated can read order art files" on storage.objects;
drop policy if exists "Order art files storage by company" on storage.objects;
drop policy if exists "Order art files storage write by company" on storage.objects;

create policy "Order art files storage by company"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'order-art-files'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  );

create policy "Order art files storage write by company"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'order-art-files'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  )
  with check (
    bucket_id = 'order-art-files'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  );

-- Storage object policies for order-final-photos bucket
drop policy if exists "Authenticated can upload order final photos" on storage.objects;
drop policy if exists "Authenticated can update order final photos" on storage.objects;
drop policy if exists "Authenticated can delete order final photos" on storage.objects;
drop policy if exists "Authenticated can read order final photos" on storage.objects;
drop policy if exists "Order final photos storage by company" on storage.objects;
drop policy if exists "Order final photos storage write by company" on storage.objects;

create policy "Order final photos storage by company"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'order-final-photos'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  );

create policy "Order final photos storage write by company"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'order-final-photos'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  )
  with check (
    bucket_id = 'order-final-photos'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.orders o
        where o.id = public.path_root_uuid(name)
          and o.company_id = public.current_company_id()
      )
    )
  );
