-- Reset company data helper and audit logs

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'Admins can view audit logs'
  ) then
    create policy "Admins can view audit logs"
      on public.audit_logs
      for select
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
        and exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;

create or replace function public.reset_company_data(p_company_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_ids uuid[];
  v_user_ids uuid[];
begin
  if p_company_id is null then
    raise exception 'company_id required';
  end if;

  select array_agg(id) into v_order_ids
  from public.orders
  where company_id = p_company_id;

  select array_agg(id) into v_user_ids
  from public.profiles
  where company_id = p_company_id;

  if to_regclass('public.order_public_links') is not null then
    delete from public.order_public_links
    where order_id = any(v_order_ids);
  end if;

  if to_regclass('public.order_final_photos') is not null then
    delete from public.order_final_photos
    where order_id = any(v_order_ids);
  end if;

  if to_regclass('public.order_status_history') is not null then
    delete from public.order_status_history
    where order_id = any(v_order_ids);
  end if;

  if to_regclass('public.order_items') is not null then
    delete from public.order_items
    where order_id = any(v_order_ids);
  end if;

  if to_regclass('public.order_payments') is not null then
    delete from public.order_payments
    where company_id = p_company_id;
  end if;

  if to_regclass('public.order_notifications') is not null then
    delete from public.order_notifications
    where company_id = p_company_id;
  end if;

  if to_regclass('public.orders') is not null then
    delete from public.orders
    where company_id = p_company_id;
  end if;

  if to_regclass('public.sale_items') is not null then
    delete from public.sale_items
    where sale_id in (
      select id from public.sales where user_id = any(v_user_ids)
    );
  end if;

  if to_regclass('public.sales') is not null then
    delete from public.sales
    where user_id = any(v_user_ids);
  end if;

  if to_regclass('public.product_supplies') is not null then
    delete from public.product_supplies
    where product_id in (
      select id from public.products where company_id = p_company_id
    );
  end if;

  if to_regclass('public.product_attributes') is not null then
    delete from public.product_attributes
    where product_id in (
      select id from public.products where company_id = p_company_id
    );
  end if;

  if to_regclass('public.price_tiers') is not null then
    delete from public.price_tiers
    where product_id in (
      select id from public.products where company_id = p_company_id
    );
  end if;

  if to_regclass('public.stock_movements') is not null then
    delete from public.stock_movements
    where product_id in (
      select id from public.products where company_id = p_company_id
    );
  end if;

  if to_regclass('public.products') is not null then
    delete from public.products
    where company_id = p_company_id;
  end if;

  if to_regclass('public.customers') is not null then
    delete from public.customers c
    where c.id in (
      select customer_id
      from public.orders
      where company_id = p_company_id
        and customer_id is not null
      union
      select customer_id
      from public.sales
      where user_id = any(v_user_ids)
        and customer_id is not null
    )
    and not exists (
      select 1
      from public.orders o
      where o.customer_id = c.id
        and o.company_id is distinct from p_company_id
    )
    and not exists (
      select 1
      from public.sales s
      join public.profiles p on p.id = s.user_id
      where s.customer_id = c.id
        and p.company_id is distinct from p_company_id
    );
  end if;

  if to_regclass('public.financial_entries') is not null then
    delete from public.financial_entries
    where company_id = p_company_id;
  end if;

  if to_regclass('public.expense_categories') is not null then
    delete from public.expense_categories
    where company_id = p_company_id;
  end if;

  if to_regclass('public.banners') is not null then
    delete from public.banners
    where company_id = p_company_id;
  end if;

  if to_regclass('public.subscriptions') is not null then
    delete from public.subscriptions
    where company_id = p_company_id;
  end if;

  insert into public.audit_logs (company_id, admin_id, action, metadata)
  values (
    p_company_id,
    p_admin_id,
    'reset_company_data',
    jsonb_build_object(
      'orders', coalesce(array_length(v_order_ids, 1), 0),
      'users', coalesce(array_length(v_user_ids, 1), 0)
    )
  );
end;
$$;
