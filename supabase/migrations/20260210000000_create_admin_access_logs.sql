create table if not exists public.admin_access_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null,
  ip text,
  created_at timestamptz not null default now()
);

alter table public.admin_access_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_access_logs'
      and policyname = 'Super admin can view admin access logs'
  ) then
    create policy "Super admin can view admin access logs"
      on public.admin_access_logs
      for select
      to authenticated
      using (public.has_role(auth.uid(), 'super_admin'::public.app_role));
  end if;
end $$;
