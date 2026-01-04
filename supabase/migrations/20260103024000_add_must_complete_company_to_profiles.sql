alter table public.profiles
  add column if not exists must_complete_company boolean not null default false;
