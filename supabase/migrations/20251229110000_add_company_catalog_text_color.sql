-- Add catalog text color customization for public catalog.

alter table public.companies
  add column if not exists catalog_text_color text default '#111827';
