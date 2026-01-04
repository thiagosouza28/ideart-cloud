create table if not exists public.company_users (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  constraint company_users_pkey primary key (id),
  constraint company_users_company_user_key unique (company_id, user_id)
);
