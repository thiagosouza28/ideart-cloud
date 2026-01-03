-- Subscription checkout intents for CAKTO public signup flow.

create table if not exists public.subscription_checkouts (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null,
  full_name text,
  company_name text,
  plan_id uuid references public.plans(id),
  cakto_subscription_id text,
  status text not null default 'created',
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists subscription_checkouts_token_idx
  on public.subscription_checkouts (token);

create index if not exists subscription_checkouts_email_idx
  on public.subscription_checkouts (email);

alter table public.subscription_checkouts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_subscription_checkouts_updated_at'
  ) then
    create trigger update_subscription_checkouts_updated_at
      before update on public.subscription_checkouts
      for each row execute function public.update_updated_at();
  end if;
end $$;
