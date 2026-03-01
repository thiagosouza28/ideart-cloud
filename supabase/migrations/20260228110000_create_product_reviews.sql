-- Allow public catalog clients to rate and review products.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null,
  reviewer_phone text null,
  rating smallint not null check (rating between 1 and 5),
  comment text null,
  is_approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_reviews_product_id_idx
  on public.product_reviews(product_id);

create index if not exists product_reviews_company_id_idx
  on public.product_reviews(company_id);

create index if not exists product_reviews_is_approved_idx
  on public.product_reviews(is_approved);

create index if not exists product_reviews_created_at_idx
  on public.product_reviews(created_at desc);

drop trigger if exists update_product_reviews_updated_at on public.product_reviews;
create trigger update_product_reviews_updated_at
before update on public.product_reviews
for each row execute function public.update_updated_at();

alter table public.product_reviews enable row level security;

drop policy if exists "Product reviews public read approved" on public.product_reviews;
drop policy if exists "Product reviews public insert" on public.product_reviews;
drop policy if exists "Product reviews admin update" on public.product_reviews;
drop policy if exists "Product reviews admin delete" on public.product_reviews;

create policy "Product reviews public read approved"
  on public.product_reviews
  for select
  to anon, authenticated
  using (
    is_approved = true
    and exists (
      select 1
      from public.products p
      join public.companies c on c.id = p.company_id
      where p.id = product_reviews.product_id
        and p.company_id = product_reviews.company_id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or p.show_in_catalog = true)
        and c.is_active = true
    )
  );

create policy "Product reviews public insert"
  on public.product_reviews
  for insert
  to anon, authenticated
  with check (
    rating between 1 and 5
    and length(trim(coalesce(reviewer_name, ''))) between 2 and 120
    and exists (
      select 1
      from public.products p
      join public.companies c on c.id = p.company_id
      where p.id = product_reviews.product_id
        and p.company_id = product_reviews.company_id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or p.show_in_catalog = true)
        and c.is_active = true
    )
  );

create policy "Product reviews admin update"
  on public.product_reviews
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

create policy "Product reviews admin delete"
  on public.product_reviews
  for delete
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

grant select, insert on table public.product_reviews to anon, authenticated;
grant update, delete on table public.product_reviews to authenticated;
