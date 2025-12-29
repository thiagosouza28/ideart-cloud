-- Financial entries and expense categories for reports.
do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'financial_entry_type'
  ) then
    create type public.financial_entry_type as enum ('receita', 'despesa');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'financial_entry_status'
  ) then
    create type public.financial_entry_status as enum ('pendente', 'pago', 'atrasado');
  end if;
end $$;

create table if not exists public.expense_categories (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists expense_categories_company_name_key
  on public.expense_categories(company_id, name);

create table if not exists public.financial_entries (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade,
  type public.financial_entry_type not null,
  origin text not null default 'manual',
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(10,2) not null,
  status public.financial_entry_status not null default 'pendente',
  payment_method public.payment_method,
  description text,
  notes text,
  occurred_at timestamp with time zone not null default now(),
  due_date timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists financial_entries_company_id_idx
  on public.financial_entries(company_id);

create index if not exists financial_entries_occurred_at_idx
  on public.financial_entries(occurred_at);

create index if not exists financial_entries_type_idx
  on public.financial_entries(type);

alter table public.expense_categories enable row level security;
alter table public.financial_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'expense_categories'
      and policyname = 'Authenticated can manage expense categories'
  ) then
    create policy "Authenticated can manage expense categories"
      on public.expense_categories
      for all
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      )
      with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'financial_entries'
      and policyname = 'Authenticated can manage financial entries'
  ) then
    create policy "Authenticated can manage financial entries"
      on public.financial_entries
      for all
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      )
      with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;
end $$;
