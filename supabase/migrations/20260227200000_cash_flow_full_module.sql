-- Cash flow module hardening and role-based access.

-- ------------------------------------------------------------
-- Roles and enums
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role'
      and e.enumlabel = 'financeiro'
  ) then
    alter type public.app_role add value 'financeiro';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_method'
      and e.enumlabel = 'credito'
  ) then
    alter type public.payment_method add value 'credito';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_method'
      and e.enumlabel = 'debito'
  ) then
    alter type public.payment_method add value 'debito';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_method'
      and e.enumlabel = 'transferencia'
  ) then
    alter type public.payment_method add value 'transferencia';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'financial_entry_origin'
  ) then
    create type public.financial_entry_origin as enum (
      'venda',
      'assinatura',
      'custo',
      'reembolso',
      'ajuste',
      'manual',
      'pdv',
      'order_payment',
      'order_payment_cancel',
      'order_payment_delete',
      'outros'
    );
  end if;
end $$;

-- ------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.apply_current_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  return new;
end;
$$;

create or replace function public.is_finance_role(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role::text = 'financeiro'
  );
$$;

create or replace function public.financial_entries_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.updated_by is null then
      new.updated_by := coalesce(new.created_by, auth.uid());
    end if;
    if new.updated_at is null then
      new.updated_at := now();
    end if;
  else
    new.updated_at := now();
    if new.updated_by is null then
      new.updated_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_delete_automatic_financial_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_automatic then
    raise exception 'Lancamentos automaticos nao podem ser excluidos';
  end if;
  return old;
end;
$$;

create or replace function public.audit_financial_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.financial_entry_history (
      entry_id,
      company_id,
      action,
      old_data,
      new_data,
      changed_by
    ) values (
      new.id,
      new.company_id,
      'insert',
      null,
      to_jsonb(new),
      coalesce(new.updated_by, new.created_by, auth.uid())
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.financial_entry_history (
      entry_id,
      company_id,
      action,
      old_data,
      new_data,
      changed_by
    ) values (
      new.id,
      new.company_id,
      'update',
      to_jsonb(old),
      to_jsonb(new),
      coalesce(new.updated_by, auth.uid())
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.financial_entry_history (
      entry_id,
      company_id,
      action,
      old_data,
      new_data,
      changed_by
    ) values (
      old.id,
      old.company_id,
      'delete',
      to_jsonb(old),
      null,
      auth.uid()
    );
    return old;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Schema updates
-- ------------------------------------------------------------

alter table public.financial_entries
  add column if not exists related_id uuid,
  add column if not exists is_automatic boolean not null default false,
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $$
declare
  v_origin_type text;
begin
  select c.udt_name
    into v_origin_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'financial_entries'
    and c.column_name = 'origin';

  if v_origin_type is null then
    alter table public.financial_entries
      add column origin public.financial_entry_origin not null default 'outros'::public.financial_entry_origin;
  elsif v_origin_type <> 'financial_entry_origin' then
    alter table public.financial_entries
      alter column origin drop default;

    alter table public.financial_entries
      alter column origin type public.financial_entry_origin
      using (
        case lower(coalesce(origin::text, ''))
          when 'venda' then 'venda'::public.financial_entry_origin
          when 'assinatura' then 'assinatura'::public.financial_entry_origin
          when 'custo' then 'custo'::public.financial_entry_origin
          when 'reembolso' then 'reembolso'::public.financial_entry_origin
          when 'ajuste' then 'ajuste'::public.financial_entry_origin
          when 'manual' then 'manual'::public.financial_entry_origin
          when 'pdv' then 'pdv'::public.financial_entry_origin
          when 'order_payment' then 'order_payment'::public.financial_entry_origin
          when 'order_payment_cancel' then 'order_payment_cancel'::public.financial_entry_origin
          when 'order_payment_delete' then 'order_payment_delete'::public.financial_entry_origin
          when 'venda_pedido' then 'venda'::public.financial_entry_origin
          when 'order' then 'venda'::public.financial_entry_origin
          else 'outros'::public.financial_entry_origin
        end
      );
  end if;

  alter table public.financial_entries
    alter column origin set default 'outros'::public.financial_entry_origin;
end $$;

create table if not exists public.financial_entry_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.financial_entries(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamp with time zone not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create index if not exists financial_entries_origin_idx
  on public.financial_entries(origin);

create index if not exists financial_entries_payment_method_idx
  on public.financial_entries(payment_method);

create index if not exists financial_entries_created_by_idx
  on public.financial_entries(created_by);

create index if not exists financial_entries_related_id_idx
  on public.financial_entries(related_id);

create index if not exists financial_entries_automatic_idx
  on public.financial_entries(is_automatic);

create index if not exists financial_entries_company_occurred_idx
  on public.financial_entries(company_id, occurred_at desc);

create index if not exists financial_entry_history_company_id_idx
  on public.financial_entry_history(company_id);

create index if not exists financial_entry_history_entry_id_idx
  on public.financial_entry_history(entry_id);

create index if not exists financial_entry_history_changed_at_idx
  on public.financial_entry_history(changed_at desc);

drop trigger if exists set_financial_entries_company_id on public.financial_entries;
create trigger set_financial_entries_company_id
before insert on public.financial_entries
for each row
execute function public.apply_current_company_id();

drop trigger if exists trg_financial_entries_set_audit_fields on public.financial_entries;
create trigger trg_financial_entries_set_audit_fields
before insert or update on public.financial_entries
for each row
execute function public.financial_entries_set_audit_fields();

drop trigger if exists trg_financial_entries_prevent_delete_auto on public.financial_entries;
create trigger trg_financial_entries_prevent_delete_auto
before delete on public.financial_entries
for each row
execute function public.prevent_delete_automatic_financial_entries();

drop trigger if exists trg_financial_entries_audit on public.financial_entries;
create trigger trg_financial_entries_audit
after insert or update or delete on public.financial_entries
for each row
execute function public.audit_financial_entries();

-- ------------------------------------------------------------
-- RLS policies
-- ------------------------------------------------------------

alter table public.financial_entry_history enable row level security;

drop policy if exists "Authenticated can manage financial entries" on public.financial_entries;
drop policy if exists "Authenticated can manage expense categories" on public.expense_categories;

drop policy if exists "Financial entries select by company role" on public.financial_entries;
drop policy if exists "Financial entries insert by finance" on public.financial_entries;
drop policy if exists "Financial entries update by finance" on public.financial_entries;
drop policy if exists "Financial entries delete by finance" on public.financial_entries;

drop policy if exists "Expense categories select by company role" on public.expense_categories;
drop policy if exists "Expense categories write by finance" on public.expense_categories;

drop policy if exists "Financial history select by company role" on public.financial_entry_history;

create policy "Financial entries select by company role"
  on public.financial_entries
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
        or (
          public.has_role(auth.uid(), 'producao'::public.app_role)
          and type = 'receita'::public.financial_entry_type
        )
      )
    )
  );

create policy "Financial entries insert by finance"
  on public.financial_entries
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
      )
    )
  );

create policy "Financial entries update by finance"
  on public.financial_entries
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
      )
    )
  );

create policy "Financial entries delete by finance"
  on public.financial_entries
  for delete
  to authenticated
  using (
    (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or (
        company_id = public.current_company_id()
        and (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          or public.is_finance_role(auth.uid())
        )
      )
    )
    and is_automatic = false
  );

create policy "Expense categories select by company role"
  on public.expense_categories
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
        or public.has_role(auth.uid(), 'producao'::public.app_role)
      )
    )
  );

create policy "Expense categories write by finance"
  on public.expense_categories
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
      )
    )
  );

create policy "Financial history select by company role"
  on public.financial_entry_history
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      company_id = public.current_company_id()
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.is_finance_role(auth.uid())
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
        or public.has_role(auth.uid(), 'producao'::public.app_role)
      )
    )
  );
