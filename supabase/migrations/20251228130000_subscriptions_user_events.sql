-- Align subscriptions table to user-based SaaS flow and add subscription event idempotency.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status text not null default 'trial',
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

alter table public.subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists trial_ends_at timestamp with time zone,
  add column if not exists current_period_ends_at timestamp with time zone,
  add column if not exists gateway text,
  add column if not exists gateway_subscription_id text;

alter table public.subscriptions
  alter column status set default 'trial',
  alter column gateway set default 'yampi';

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

create index if not exists subscriptions_gateway_subscription_id_idx
  on public.subscriptions (gateway_subscription_id);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text,
  payload jsonb,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone
);

create unique index if not exists subscription_events_event_id_key
  on public.subscription_events (event_id);

alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Authenticated can view subscriptions by user'
  ) then
    create policy "Authenticated can view subscriptions by user"
      on public.subscriptions
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Authenticated can manage subscriptions by user'
  ) then
    create policy "Authenticated can manage subscriptions by user"
      on public.subscriptions
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
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

with company_users as (
  select distinct on (company_id) id, company_id
  from public.profiles
  where company_id is not null
  order by company_id, created_at asc
)
update public.subscriptions s
set user_id = cu.id
from company_users cu
where s.user_id is null
  and s.company_id = cu.company_id;
