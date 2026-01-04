create temporary table latest_checkout as
select distinct on (company_id)
  company_id,
  plan_id
from public.subscription_checkouts
where plan_id is not null
order by company_id, created_at desc;

update public.companies c
set plan_id = lc.plan_id
from latest_checkout lc
where c.plan_id is null
  and c.id = lc.company_id;

update public.subscriptions s
set plan_id = lc.plan_id
from latest_checkout lc
where s.plan_id is null
  and s.company_id = lc.company_id;

drop table latest_checkout;
