create unique index if not exists plans_cakto_plan_id_unique
  on public.plans (cakto_plan_id)
  where cakto_plan_id is not null;
