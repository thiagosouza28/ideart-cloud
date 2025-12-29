-- Add period_days to plans and backfill from billing_period.

alter table public.plans
  add column if not exists period_days integer;

update public.plans
set period_days = case
  when billing_period = 'yearly' then 365
  else 30
end
where period_days is null;

alter table public.plans
  alter column period_days set default 30,
  alter column period_days set not null;
