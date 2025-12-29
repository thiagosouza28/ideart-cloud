-- Hotfix for missing schema changes in Supabase.
-- Run this in the Supabase SQL editor (no transaction wrapper).

alter table public.products
  add column if not exists track_stock boolean not null default true;

alter table public.products
  add column if not exists final_price numeric(10,2);

update public.products
set track_stock = true
where track_stock is null;

alter type public.order_status
  add value if not exists 'pendente' before 'em_producao';

select pg_notify('pgrst', 'reload schema');
