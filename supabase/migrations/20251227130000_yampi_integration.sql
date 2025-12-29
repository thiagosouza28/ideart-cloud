-- Yampi integration: payments, subscriptions, webhook events, and SKU mapping.

alter type public.payment_method
  add value if not exists 'boleto' after 'pix';

alter type public.payment_method
  add value if not exists 'outro' after 'boleto';

alter table public.products
  add column if not exists yampi_sku_id text;

alter table public.plans
  add column if not exists yampi_sku_id text;

alter table public.orders
  add column if not exists gateway text,
  add column if not exists gateway_order_id text,
  add column if not exists payment_link_id text,
  add column if not exists payment_link_url text;

alter table public.order_payments
  add column if not exists gateway text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_transaction_id text,
  add column if not exists raw_payload jsonb;

create index if not exists orders_gateway_order_id_idx
  on public.orders (gateway_order_id);

create index if not exists orders_payment_link_id_idx
  on public.orders (payment_link_id);

create index if not exists order_payments_gateway_order_id_idx
  on public.order_payments (gateway_order_id);

create index if not exists order_payments_gateway_transaction_id_idx
  on public.order_payments (gateway_transaction_id);

create index if not exists products_yampi_sku_id_idx
  on public.products (yampi_sku_id);

create index if not exists plans_yampi_sku_id_idx
  on public.plans (yampi_sku_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status text not null default 'pending',
  trial_ends_at timestamp with time zone,
  current_period_ends_at timestamp with time zone,
  gateway text not null default 'yampi',
  gateway_subscription_id text,
  gateway_order_id text,
  gateway_payment_link_id text,
  payment_link_url text,
  last_payment_status text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists subscriptions_company_id_idx
  on public.subscriptions (company_id);

create index if not exists subscriptions_gateway_order_id_idx
  on public.subscriptions (gateway_order_id);

create index if not exists subscriptions_gateway_payment_link_id_idx
  on public.subscriptions (gateway_payment_link_id);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text not null,
  event_type text,
  payload jsonb,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone
);

create unique index if not exists webhook_events_event_id_key
  on public.webhook_events (event_id);

alter table public.subscriptions enable row level security;

alter table public.webhook_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Authenticated can view subscriptions'
  ) then
    create policy "Authenticated can view subscriptions"
      on public.subscriptions
      for select
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Authenticated can manage subscriptions'
  ) then
    create policy "Authenticated can manage subscriptions"
      on public.subscriptions
      for all
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      )
      with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_subscriptions_updated_at'
  ) then
    create trigger update_subscriptions_updated_at
      before update on public.subscriptions
      for each row execute function public.update_updated_at();
  end if;
end $$;
