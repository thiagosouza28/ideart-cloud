-- Add Yampi checkout mapping to plans.

alter table public.plans
  add column if not exists yampi_product_id text,
  add column if not exists yampi_checkout_url text;

create index if not exists plans_yampi_product_id_idx
  on public.plans (yampi_product_id);
