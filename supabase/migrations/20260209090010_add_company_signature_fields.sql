alter table public.companies
  add column if not exists signature_image_url text,
  add column if not exists signature_responsible text,
  add column if not exists signature_role text;
