alter table public.orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

alter table public.companies
  add column if not exists whatsapp_message_template text;
