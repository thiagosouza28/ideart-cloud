-- Add email to profiles so user management can show identity details
-- without relying on auth admin APIs from the client.

alter table public.profiles
  add column if not exists email text;

create index if not exists profiles_email_idx
  on public.profiles (lower(email));

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- Keep profile creation aligned with auth.users data.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  desired_role public.app_role;
  raw_role text := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', ''));
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  if account_type <> 'customer' then
    desired_role := case raw_role
      when 'super_admin' then 'super_admin'::public.app_role
      when 'admin' then 'admin'::public.app_role
      when 'financeiro' then 'financeiro'::public.app_role
      when 'atendente' then 'atendente'::public.app_role
      when 'caixa' then 'caixa'::public.app_role
      when 'producao' then 'producao'::public.app_role
      else 'admin'::public.app_role
    end;

    insert into public.user_roles (user_id, role)
    values (new.id, desired_role)
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

-- Sync profile email/full_name when auth user data changes.
create or replace function public.sync_profile_from_auth_user() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.profiles p
  set
    full_name = coalesce(new.raw_user_meta_data->>'full_name', new.email, p.full_name),
    email = coalesce(new.email, p.email),
    updated_at = now()
  where p.id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_profile_from_auth_user();
