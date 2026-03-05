-- Allow each company to customize customer-facing message text by order status.

alter table public.companies
  add column if not exists order_status_message_templates jsonb;

update public.companies
set order_status_message_templates = '{}'::jsonb
where order_status_message_templates is null;
