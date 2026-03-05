-- Allow each company to define visible order statuses and custom status labels.

alter table public.companies
  add column if not exists order_status_customization jsonb;

update public.companies
set order_status_customization = '{}'::jsonb
where order_status_customization is null;
