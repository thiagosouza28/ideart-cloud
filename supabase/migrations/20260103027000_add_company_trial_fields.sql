alter table public.companies
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists trial_active boolean not null default false,
  add column if not exists trial_ends_at timestamp with time zone;
