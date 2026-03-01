alter table public.companies
  add column if not exists minimum_delivery_value numeric(10,2) default 0;

update public.companies
set minimum_delivery_value = coalesce(minimum_delivery_value, minimum_order_value, 0)
where minimum_delivery_value is null;
