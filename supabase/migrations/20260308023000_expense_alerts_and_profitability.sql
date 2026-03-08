alter table public.expenses
  add column if not exists due_date date,
  add column if not exists due_day integer,
  add column if not exists allocation_method text not null default 'percentual_custo';

update public.expenses
set due_date = coalesce(due_date, expense_date)
where expense_type = 'nao_recorrente';

update public.expenses
set due_day = coalesce(
  due_day,
  case
    when expense_date is not null then extract(day from expense_date)::integer
    else extract(day from created_at)::integer
  end
)
where expense_type = 'recorrente';

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'expenses'
      and constraint_name = 'expenses_due_day_check'
  ) then
    alter table public.expenses
      add constraint expenses_due_day_check
      check (due_day is null or (due_day >= 1 and due_day <= 31));
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'expenses'
      and constraint_name = 'expenses_allocation_method_check'
  ) then
    alter table public.expenses
      add constraint expenses_allocation_method_check
      check (allocation_method in ('percentual_custo', 'quantidade_vendas'));
  end if;
end $$;

create index if not exists expenses_due_date_idx on public.expenses(due_date, status);
create index if not exists expenses_due_day_idx on public.expenses(due_day, status);
