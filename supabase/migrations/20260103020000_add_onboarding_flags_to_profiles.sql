alter table public.profiles
  add column if not exists must_complete_onboarding boolean not null default false;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
