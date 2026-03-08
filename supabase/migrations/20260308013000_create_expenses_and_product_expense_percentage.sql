alter table public.products
  add column if not exists expense_percentage numeric not null default 0;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_type text not null,
  name text not null,
  category text,
  monthly_amount numeric,
  amount numeric,
  expense_date date,
  description text,
  status text not null default 'ativo',
  apply_to_product_cost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_type_check check (expense_type in ('recorrente', 'nao_recorrente')),
  constraint expenses_status_check check (status in ('ativo', 'inativo', 'pendente', 'pago')),
  constraint expenses_value_check check (
    (expense_type = 'recorrente' and monthly_amount is not null and amount is null)
    or
    (expense_type = 'nao_recorrente' and amount is not null and monthly_amount is null)
  )
);

create index if not exists expenses_company_id_idx on public.expenses(company_id);
create index if not exists expenses_type_idx on public.expenses(expense_type);
create index if not exists expenses_status_idx on public.expenses(status);

alter table public.expenses enable row level security;

drop trigger if exists update_expenses_updated_at on public.expenses;
create trigger update_expenses_updated_at
before update on public.expenses
for each row execute function public.update_updated_at();

drop policy if exists "Company users can view own expenses" on public.expenses;
create policy "Company users can view own expenses"
on public.expenses
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = expenses.company_id
  )
  or exists (
    select 1
    from public.company_users cu
    where cu.user_id = auth.uid()
      and cu.company_id = expenses.company_id
  )
);

drop policy if exists "Company admins and finance can manage own expenses" on public.expenses;
create policy "Company admins and finance can manage own expenses"
on public.expenses
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = expenses.company_id
      and ur.role in ('admin'::public.app_role, 'financeiro'::public.app_role)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = expenses.company_id
      and ur.role in ('admin'::public.app_role, 'financeiro'::public.app_role)
  )
);

grant select, insert, update, delete on public.expenses to authenticated;
