alter table public.expenses
  add column if not exists paid_amount numeric,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method public.payment_method,
  add column if not exists payment_notes text;

create index if not exists expenses_paid_at_idx on public.expenses(paid_at);

create table if not exists public.supply_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  movement_type public.stock_movement_type not null default 'saida',
  origin text not null default 'venda_produto',
  quantity numeric not null check (quantity > 0),
  reason text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supply_stock_movements_origin_check check (origin in ('venda_produto', 'manual', 'ajuste'))
);

create index if not exists supply_stock_movements_company_id_idx
  on public.supply_stock_movements(company_id, created_at desc);

create index if not exists supply_stock_movements_supply_id_idx
  on public.supply_stock_movements(supply_id, created_at desc);

create index if not exists supply_stock_movements_order_id_idx
  on public.supply_stock_movements(order_id)
  where order_id is not null;

create index if not exists supply_stock_movements_sale_id_idx
  on public.supply_stock_movements(sale_id)
  where sale_id is not null;

alter table public.supply_stock_movements enable row level security;

drop policy if exists "Supply stock movements select by company" on public.supply_stock_movements;
create policy "Supply stock movements select by company"
on public.supply_stock_movements
for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Supply stock movements insert by company roles" on public.supply_stock_movements;
create policy "Supply stock movements insert by company roles"
on public.supply_stock_movements
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'financeiro'::public.app_role)
    or public.has_role(auth.uid(), 'atendente'::public.app_role)
    or public.has_role(auth.uid(), 'caixa'::public.app_role)
    or public.has_role(auth.uid(), 'producao'::public.app_role)
  )
);

grant select, insert on public.supply_stock_movements to authenticated;

create or replace function public.consume_product_supplies(
  p_company_id uuid,
  p_items jsonb,
  p_order_id uuid default null,
  p_sale_id uuid default null,
  p_user_id uuid default null,
  p_origin text default 'venda_produto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_supply_count integer := 0;
  v_movement_count integer := 0;
begin
  if p_company_id is null then
    raise exception 'Empresa obrigatoria';
  end if;

  if coalesce(p_origin, 'venda_produto') not in ('venda_produto', 'manual', 'ajuste') then
    raise exception 'Origem invalida';
  end if;

  if auth.role() = 'authenticated' then
    v_company_id := public.current_company_id();
    if v_company_id is distinct from p_company_id then
      raise exception 'Empresa invalida para esta sessao';
    end if;
  end if;

  with normalized_items as (
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      nullif(trim(coalesce(item->>'product_name', '')), '') as product_name,
      greatest(coalesce((item->>'quantity')::numeric, 0), 0) as sold_quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
  ),
  valid_items as (
    select *
    from normalized_items
    where product_id is not null
      and sold_quantity > 0
  ),
  expanded as (
    select
      vi.product_id,
      coalesce(vi.product_name, pr.name) as product_name,
      ps.supply_id,
      (vi.sold_quantity * coalesce(ps.quantity, 0))::numeric as consumed_quantity
    from valid_items vi
    join public.products pr
      on pr.id = vi.product_id
     and pr.company_id = p_company_id
    join public.product_supplies ps
      on ps.product_id = vi.product_id
    where coalesce(ps.quantity, 0) > 0
  ),
  aggregated as (
    select
      supply_id,
      sum(consumed_quantity) as total_consumed
    from expanded
    where consumed_quantity > 0
    group by supply_id
  ),
  updated_supplies as (
    update public.supplies s
    set stock_quantity = coalesce(s.stock_quantity, 0) - aggregated.total_consumed
    from aggregated
    where s.id = aggregated.supply_id
      and s.company_id = p_company_id
    returning s.id
  ),
  inserted_movements as (
    insert into public.supply_stock_movements (
      company_id,
      supply_id,
      product_id,
      order_id,
      sale_id,
      movement_type,
      origin,
      quantity,
      reason,
      user_id
    )
    select
      p_company_id,
      expanded.supply_id,
      expanded.product_id,
      p_order_id,
      p_sale_id,
      'saida'::public.stock_movement_type,
      coalesce(p_origin, 'venda_produto'),
      expanded.consumed_quantity,
      case
        when p_order_id is not null then 'Baixa automatica por pedido finalizado: ' || coalesce(expanded.product_name, 'Produto')
        when p_sale_id is not null then 'Baixa automatica por venda PDV: ' || coalesce(expanded.product_name, 'Produto')
        else 'Baixa automatica por venda de produto: ' || coalesce(expanded.product_name, 'Produto')
      end,
      p_user_id
    from expanded
    where expanded.consumed_quantity > 0
    returning id
  )
  select
    (select count(*) from updated_supplies),
    (select count(*) from inserted_movements)
  into v_supply_count, v_movement_count;

  return jsonb_build_object(
    'supply_count', coalesce(v_supply_count, 0),
    'movement_count', coalesce(v_movement_count, 0)
  );
end;
$$;

grant execute on function public.consume_product_supplies(uuid, jsonb, uuid, uuid, uuid, text) to authenticated;

create or replace function public.pay_expense(
  p_expense_id uuid,
  p_paid_amount numeric,
  p_paid_at timestamptz,
  p_payment_method public.payment_method,
  p_payment_notes text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_effective_paid_at timestamptz := coalesce(p_paid_at, now());
  v_paid_amount numeric := coalesce(p_paid_amount, 0);
  v_same_cycle boolean := false;
begin
  if auth.role() = 'authenticated' then
    v_company_id := public.current_company_id();
    if v_company_id is null then
      raise exception 'Empresa nao encontrada para esta sessao';
    end if;
  end if;

  if v_paid_amount <= 0 then
    raise exception 'Informe um valor pago maior que zero';
  end if;

  select *
  into v_expense
  from public.expenses
  where id = p_expense_id
  for update;

  if not found then
    raise exception 'Despesa nao encontrada';
  end if;

  if auth.role() = 'authenticated' and v_expense.company_id is distinct from v_company_id then
    raise exception 'Despesa nao pertence a empresa atual';
  end if;

  if v_expense.status = 'inativo' then
    raise exception 'Nao e possivel pagar uma despesa inativa';
  end if;

  if v_expense.status = 'pago' and v_expense.expense_type = 'nao_recorrente' then
    raise exception 'Essa despesa ja esta paga';
  end if;

  if v_expense.expense_type = 'recorrente' and v_expense.paid_at is not null then
    v_same_cycle :=
      date_trunc('month', v_expense.paid_at) = date_trunc('month', v_effective_paid_at);
  end if;

  if v_same_cycle then
    raise exception 'Essa despesa recorrente ja foi paga neste periodo';
  end if;

  update public.expenses
  set
    status = 'pago',
    paid_amount = v_paid_amount,
    paid_at = v_effective_paid_at,
    payment_method = p_payment_method,
    payment_notes = nullif(trim(coalesce(p_payment_notes, '')), ''),
    updated_at = now()
  where id = p_expense_id
  returning *
  into v_expense;

  insert into public.financial_entries (
    company_id,
    type,
    origin,
    amount,
    status,
    payment_method,
    description,
    notes,
    occurred_at,
    paid_at,
    related_id,
    is_automatic,
    created_by,
    updated_by
  ) values (
    v_expense.company_id,
    'despesa',
    'custo',
    v_paid_amount,
    'pago',
    p_payment_method,
    v_expense.name,
    nullif(trim(coalesce(p_payment_notes, '')), ''),
    v_effective_paid_at,
    v_effective_paid_at,
    v_expense.id,
    true,
    v_user_id,
    v_user_id
  );

  return v_expense;
end;
$$;

grant execute on function public.pay_expense(uuid, numeric, timestamptz, public.payment_method, text) to authenticated;
