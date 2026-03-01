-- Customer accounts should not receive internal store roles.
-- Also ensure catalog customer profile linkage RPC is available in incremental migration.

alter table public.customers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists customers_user_id_idx on public.customers(user_id);
create index if not exists customers_company_user_id_idx on public.customers(company_id, user_id);

drop policy if exists "Customers customer own read" on public.customers;
create policy "Customers customer own read"
  on public.customers
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.upsert_catalog_customer_profile(
  p_company_id uuid,
  p_name text default null,
  p_phone text default null,
  p_document text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_document text := nullif(trim(coalesce(p_document, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    raise exception 'Company not found';
  end if;

  select c.id
    into v_customer_id
  from public.customers c
  where c.company_id = p_company_id
    and c.user_id = v_user_id
  order by c.updated_at desc nulls last
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      company_id,
      user_id,
      name,
      phone,
      document,
      email
    )
    values (
      p_company_id,
      v_user_id,
      coalesce(v_name, 'Cliente'),
      v_phone,
      v_document,
      v_email
    )
    returning id into v_customer_id;
  else
    update public.customers
    set name = coalesce(v_name, name),
        phone = coalesce(v_phone, phone),
        document = coalesce(v_document, document),
        email = coalesce(v_email, email),
        updated_at = now()
    where id = v_customer_id;
  end if;

  return v_customer_id;
end $$;

grant execute on function public.upsert_catalog_customer_profile(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;

delete from public.user_roles ur
using auth.users u
where ur.user_id = u.id
  and lower(coalesce(u.raw_user_meta_data->>'account_type', '')) = 'customer';

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
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

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
