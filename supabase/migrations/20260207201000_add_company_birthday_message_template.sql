-- Add configurable birthday message template for companies.

alter table public.companies
  add column if not exists birthday_message_template text;
