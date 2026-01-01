-- Add cakto_plan_id column to plans table if it doesn't exist
alter table public.plans
  add column if not exists cakto_plan_id text;

create index if not exists plans_cakto_plan_id_idx
  on public.plans (cakto_plan_id)
  where cakto_plan_id is not null;

