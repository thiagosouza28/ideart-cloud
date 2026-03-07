alter table public.orders
  add column if not exists delivered_at timestamp with time zone,
  add column if not exists delivered_by uuid references auth.users(id) on delete set null;

create index if not exists orders_delivered_by_idx
  on public.orders(delivered_by);
