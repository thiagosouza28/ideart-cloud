-- Split super admins into a dedicated table and restore missing products.final_price.

alter table public.products
  add column if not exists final_price numeric(10,2);

update public.products
set final_price = round(
  (
    (coalesce(base_cost, 0) + coalesce(labor_cost, 0))
    * (1 + (coalesce(waste_percentage, 0) / 100))
    * (1 + (coalesce(profit_margin, 0) / 100))
  )::numeric,
  2
)
where final_price is null;

create table if not exists public.super_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists super_admin_users_user_id_idx
  on public.super_admin_users(user_id);

drop trigger if exists set_super_admin_users_updated_at on public.super_admin_users;
create trigger set_super_admin_users_updated_at
before update on public.super_admin_users
for each row
execute function public.update_updated_at();

alter table public.super_admin_users enable row level security;

insert into public.super_admin_users (user_id)
select distinct ur.user_id
from public.user_roles ur
where ur.role = 'super_admin'::public.app_role
on conflict (user_id) do nothing;

delete from public.user_roles
where role = 'super_admin'::public.app_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_no_super_admin'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_no_super_admin
      check (role <> 'super_admin'::public.app_role);
  end if;
end $$;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.super_admin_users sau
    where sau.user_id = _user_id
  );
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when _user_id is null then false
    when _role = 'super_admin'::public.app_role then public.is_super_admin(_user_id)
    else exists (
      select 1
      from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role = _role
    )
  end;
$$;

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when public.is_super_admin(_user_id) then 'super_admin'::public.app_role
    else (
      select ur.role
      from public.user_roles ur
      where ur.user_id = _user_id
      order by ur.created_at asc
      limit 1
    )
  end;
$$;

create or replace function public.list_user_roles(p_user_ids uuid[])
returns table (
  user_id uuid,
  role public.app_role,
  role_id uuid
)
language sql
stable
security definer
set search_path = 'public'
as $$
  with ids as (
    select unnest(coalesce(p_user_ids, '{}'::uuid[])) as user_id
  ),
  regular_roles as (
    select distinct on (ur.user_id)
      ur.user_id,
      ur.role,
      ur.id as role_id
    from public.user_roles ur
    join ids i on i.user_id = ur.user_id
    order by ur.user_id, ur.created_at asc
  )
  select
    i.user_id,
    coalesce(
      case when sau.user_id is not null then 'super_admin'::public.app_role end,
      rr.role
    ) as role,
    coalesce(sau.id, rr.role_id) as role_id
  from ids i
  left join public.super_admin_users sau on sau.user_id = i.user_id
  left join regular_roles rr on rr.user_id = i.user_id;
$$;

grant execute on function public.list_user_roles(uuid[]) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create or replace function public.set_user_role(
  p_target_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_company uuid;
  v_target_company uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'Nao e permitido alterar o proprio cargo';
  end if;

  select company_id into v_actor_company
  from public.profiles
  where id = v_actor_id;

  select company_id into v_target_company
  from public.profiles
  where id = p_target_user_id;

  if not public.is_super_admin(v_actor_id) then
    if not public.has_role(v_actor_id, 'admin'::public.app_role) then
      raise exception 'Not authorized';
    end if;

    if p_role = 'super_admin'::public.app_role then
      raise exception 'Somente super admin pode definir super admin';
    end if;

    if v_actor_company is null or v_target_company is null or v_actor_company <> v_target_company then
      raise exception 'Voce so pode alterar usuarios da sua empresa';
    end if;
  end if;

  if p_role = 'super_admin'::public.app_role then
    delete from public.user_roles where user_id = p_target_user_id;

    insert into public.super_admin_users (user_id)
    values (p_target_user_id)
    on conflict (user_id) do nothing;

    update public.profiles
    set company_id = null,
        must_complete_company = false,
        must_complete_onboarding = false,
        updated_at = now()
    where id = p_target_user_id;

    delete from public.company_users
    where user_id = p_target_user_id;
  else
    delete from public.super_admin_users
    where user_id = p_target_user_id;

    delete from public.user_roles
    where user_id = p_target_user_id;

    insert into public.user_roles (user_id, role)
    values (p_target_user_id, p_role)
    on conflict (user_id, role) do nothing;
  end if;
end;
$$;

grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;

drop policy if exists "Super admin users select scope" on public.super_admin_users;
drop policy if exists "Super admin users manage" on public.super_admin_users;

create policy "Super admin users select scope"
  on public.super_admin_users
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

create policy "Super admin users manage"
  on public.super_admin_users
  for all
  to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

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
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email = excluded.email,
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

    if desired_role = 'super_admin'::public.app_role then
      insert into public.super_admin_users (user_id)
      values (new.id)
      on conflict (user_id) do nothing;

      delete from public.user_roles
      where user_id = new.id;
    else
      insert into public.user_roles (user_id, role)
      values (new.id, desired_role)
      on conflict (user_id, role) do nothing;

      delete from public.super_admin_users
      where user_id = new.id;
    end if;
  end if;

  return new;
end;
$$;
