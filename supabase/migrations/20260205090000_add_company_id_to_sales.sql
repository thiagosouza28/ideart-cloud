-- Add company_id to sales and secure RLS by company
alter table public.sales
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists sales_company_id_idx
  on public.sales(company_id);

update public.sales s
set company_id = p.company_id
from public.profiles p
where s.company_id is null
  and s.user_id = p.id;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales'
      and policyname = 'Authenticated can view sales'
  ) then
    drop policy "Authenticated can view sales" on public.sales;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales'
      and policyname = 'Admin/Caixa can manage sales'
  ) then
    drop policy "Admin/Caixa can manage sales" on public.sales;
  end if;
end $$;

create policy "Sales by company"
  on public.sales
  for all
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_items'
      and policyname = 'Authenticated can view sale_items'
  ) then
    drop policy "Authenticated can view sale_items" on public.sale_items;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_items'
      and policyname = 'Authenticated can insert sale_items'
  ) then
    drop policy "Authenticated can insert sale_items" on public.sale_items;
  end if;
end $$;

create policy "Sale items by company"
  on public.sale_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_items.sale_id
        and s.company_id = (select company_id from public.profiles where id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.sales s
      where s.id = sale_items.sale_id
        and s.company_id = (select company_id from public.profiles where id = auth.uid())
    )
  );
