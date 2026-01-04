create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  desired_role public.app_role;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  desired_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'admin'::public.app_role);

  insert into public.user_roles (user_id, role)
  values (new.id, desired_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;
