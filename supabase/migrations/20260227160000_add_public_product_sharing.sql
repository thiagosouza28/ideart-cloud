-- Public product templates with owner-based write protection.

alter table public.products
  add column if not exists is_public boolean not null default false,
  add column if not exists owner_id uuid,
  add column if not exists is_copy boolean not null default false,
  add column if not exists original_product_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_original_product_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_original_product_id_fkey
      foreign key (original_product_id)
      references public.products(id)
      on delete set null;
  end if;
end $$;

create index if not exists products_is_public_idx on public.products(is_public);
create index if not exists products_owner_id_idx on public.products(owner_id);
create index if not exists products_original_product_id_idx on public.products(original_product_id);

-- Backfill owners for legacy rows.
update public.products p
set owner_id = c.owner_user_id
from public.companies c
where p.owner_id is null
  and p.company_id = c.id
  and c.owner_user_id is not null;

with first_company_user as (
  select p.company_id, min(p.id::text)::uuid as user_id
  from public.profiles p
  where p.company_id is not null
  group by p.company_id
)
update public.products p
set owner_id = f.user_id
from first_company_user f
where p.owner_id is null
  and p.company_id = f.company_id;

with fallback_user as (
  select min(p.id::text)::uuid as user_id
  from public.profiles p
)
update public.products p
set owner_id = f.user_id
from fallback_user f
where p.owner_id is null
  and f.user_id is not null;

alter table public.products
  alter column owner_id set not null;

create or replace function public.apply_product_owner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;

  if new.is_public is null then
    new.is_public := false;
  end if;

  if new.is_copy is null then
    new.is_copy := false;
  end if;

  if coalesce(new.is_copy, false) = false then
    new.original_product_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_products_owner_defaults on public.products;
create trigger set_products_owner_defaults
before insert on public.products
for each row execute function public.apply_product_owner_defaults();

-- Products: select own company + public templates, write only if owner.
drop policy if exists "Products select by company" on public.products;
drop policy if exists "Products insert by company" on public.products;
drop policy if exists "Products update by company" on public.products;
drop policy if exists "Products delete by company" on public.products;
drop policy if exists "Products select own or public" on public.products;
drop policy if exists "Products insert by owner" on public.products;
drop policy if exists "Products update by owner" on public.products;
drop policy if exists "Products delete by owner" on public.products;

create policy "Products select own or public"
  on public.products
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
    or is_public = true
  );

create policy "Products insert by owner"
  on public.products
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and owner_id = auth.uid()
    )
  );

create policy "Products update by owner"
  on public.products
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and owner_id = auth.uid()
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and owner_id = auth.uid()
    )
  );

create policy "Products delete by owner"
  on public.products
  for delete
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and owner_id = auth.uid()
    )
  );

-- Allow reading metadata rows linked to public products.
drop policy if exists "Categories select from public products" on public.categories;
create policy "Categories select from public products"
  on public.categories
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products p
      where p.category_id = categories.id
        and p.is_public = true
    )
  );

drop policy if exists "Attributes select from public products" on public.attributes;
create policy "Attributes select from public products"
  on public.attributes
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.attribute_values av
      join public.product_attributes pa on pa.attribute_value_id = av.id
      join public.products p on p.id = pa.product_id
      where av.attribute_id = attributes.id
        and p.is_public = true
    )
  );

drop policy if exists "Attribute values select from public products" on public.attribute_values;
create policy "Attribute values select from public products"
  on public.attribute_values
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.product_attributes pa
      join public.products p on p.id = pa.product_id
      where pa.attribute_value_id = attribute_values.id
        and p.is_public = true
    )
  );

drop policy if exists "Price tiers select by product company" on public.price_tiers;
create policy "Price tiers select by product company"
  on public.price_tiers
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = price_tiers.product_id
        and (
          pr.company_id = public.current_company_id()
          or pr.is_public = true
        )
    )
  );

drop policy if exists "Product attributes select by product company" on public.product_attributes;
create policy "Product attributes select by product company"
  on public.product_attributes
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = product_attributes.product_id
        and (
          pr.company_id = public.current_company_id()
          or pr.is_public = true
        )
    )
  );

drop policy if exists "Product supplies select by product company" on public.product_supplies;
create policy "Product supplies select by product company"
  on public.product_supplies
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = product_supplies.product_id
        and (
          pr.company_id = public.current_company_id()
          or pr.is_public = true
        )
    )
  );
