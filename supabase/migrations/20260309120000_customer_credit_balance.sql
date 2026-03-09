-- Customer credit balance for order overpayments and credit reuse.

alter table public.customers
  add column if not exists saldo_credito numeric(10,2) not null default 0;

alter table public.orders
  add column if not exists customer_credit_used numeric(10,2) not null default 0,
  add column if not exists customer_credit_generated numeric(10,2) not null default 0;

alter table public.order_payments
  add column if not exists source text not null default 'manual',
  add column if not exists generated_credit_amount numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_payments_source_check'
      and conrelid = 'public.order_payments'::regclass
  ) then
    alter table public.order_payments
      add constraint order_payments_source_check
      check (source in ('manual', 'customer_credit'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_payments_generated_credit_amount_non_negative'
      and conrelid = 'public.order_payments'::regclass
  ) then
    alter table public.order_payments
      add constraint order_payments_generated_credit_amount_non_negative
      check (generated_credit_amount >= 0);
  end if;
end $$;

create table if not exists public.customer_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.order_payments(id) on delete set null,
  type text not null,
  amount numeric(10,2) not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_credit_transactions_type_check'
      and conrelid = 'public.customer_credit_transactions'::regclass
  ) then
    alter table public.customer_credit_transactions
      add constraint customer_credit_transactions_type_check
      check (type in ('credit_generated', 'credit_used'));
  end if;
end $$;

create index if not exists customer_credit_transactions_company_idx
  on public.customer_credit_transactions (company_id, created_at desc);

create index if not exists customer_credit_transactions_customer_idx
  on public.customer_credit_transactions (customer_id, created_at desc);

create index if not exists customer_credit_transactions_order_idx
  on public.customer_credit_transactions (order_id)
  where order_id is not null;

create index if not exists customer_credit_transactions_payment_idx
  on public.customer_credit_transactions (payment_id)
  where payment_id is not null;

alter table public.customer_credit_transactions enable row level security;

drop policy if exists "Customer credit transactions by company" on public.customer_credit_transactions;
create policy "Customer credit transactions by company"
  on public.customer_credit_transactions
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );

drop trigger if exists set_customer_credit_transactions_company_id on public.customer_credit_transactions;
create trigger set_customer_credit_transactions_company_id
before insert on public.customer_credit_transactions
for each row execute function public.apply_current_company_id();

create or replace function public.get_order_payment_summary_data(p_order_id uuid)
returns table (
  order_total numeric,
  cash_paid_total numeric,
  credit_used_total numeric,
  settled_total numeric,
  remaining numeric,
  payment_status public.payment_status,
  generated_credit_total numeric
)
language sql
stable
security definer
set search_path = 'public'
as $$
  with order_data as (
    select coalesce(o.total, 0) as total
    from public.orders o
    where o.id = p_order_id
  ),
  payment_totals as (
    select
      coalesce(sum(case when p.status <> 'pendente' and coalesce(p.source, 'manual') <> 'customer_credit' then p.amount else 0 end), 0) as cash_paid_total,
      coalesce(sum(case when p.status <> 'pendente' and coalesce(p.source, 'manual') = 'customer_credit' then p.amount else 0 end), 0) as credit_used_total,
      coalesce(sum(case when p.status <> 'pendente' then p.generated_credit_amount else 0 end), 0) as generated_credit_total
    from public.order_payments p
    where p.order_id = p_order_id
  )
  select
    o.total::numeric as order_total,
    p.cash_paid_total::numeric as cash_paid_total,
    p.credit_used_total::numeric as credit_used_total,
    (p.cash_paid_total + p.credit_used_total)::numeric as settled_total,
    greatest(0, o.total - (p.cash_paid_total + p.credit_used_total))::numeric as remaining,
    case
      when (p.cash_paid_total + p.credit_used_total) >= o.total then 'pago'::public.payment_status
      when (p.cash_paid_total + p.credit_used_total) > 0 then 'parcial'::public.payment_status
      else 'pendente'::public.payment_status
    end as payment_status,
    p.generated_credit_total::numeric as generated_credit_total
  from order_data o
  cross join payment_totals p;
$$;

create or replace function public.record_order_payment_internal(
  p_order_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_status public.payment_status default 'pago',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_cash_paid_total numeric(10,2) := 0;
  v_credit_used_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_remaining numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_generated_credit_total numeric(10,2) := 0;
  v_generated_credit_amount numeric(10,2) := 0;
  v_effective_status public.payment_status := p_status;
  v_paid_at timestamptz := null;
  v_order_label text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor inválido';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'super_admin'::public.app_role)
    or v_order.company_id = public.current_company_id()
  ) then
    raise exception 'Acesso negado';
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  if v_remaining <= 0 then
    raise exception 'Pedido já está quitado';
  end if;

  if p_status = 'pendente' and p_amount > v_remaining then
    raise exception 'Valor excede o saldo restante';
  end if;

  if p_status <> 'pendente' and p_amount > v_remaining then
    if v_order.customer_id is null then
      raise exception 'Associe um cliente ao pedido para gerar crédito do excedente';
    end if;
    v_generated_credit_amount := p_amount - v_remaining;
  end if;

  if p_status <> 'pendente' and p_amount >= v_remaining then
    v_effective_status := 'pago';
  end if;

  if v_effective_status <> 'pendente' then
    v_paid_at := now();
  end if;

  select * into v_payment
  from public.order_payments
  where order_id = p_order_id and status = 'pendente'
  order by created_at asc
  limit 1;

  if found then
    update public.order_payments
    set amount = p_amount,
        status = v_effective_status,
        method = coalesce(p_method, method),
        paid_at = coalesce(v_paid_at, paid_at),
        created_by = coalesce(created_by, v_actor),
        notes = coalesce(p_notes, notes),
        source = 'manual',
        generated_credit_amount = v_generated_credit_amount
    where id = v_payment.id
    returning * into v_payment;
  else
    insert into public.order_payments (
      order_id,
      company_id,
      amount,
      status,
      method,
      paid_at,
      created_by,
      notes,
      source,
      generated_credit_amount
    )
    values (
      p_order_id,
      v_order.company_id,
      p_amount,
      v_effective_status,
      p_method,
      v_paid_at,
      v_actor,
      p_notes,
      'manual',
      v_generated_credit_amount
    )
    returning * into v_payment;
  end if;

  if v_effective_status = 'pago' then
    delete from public.order_payments
    where order_id = p_order_id and status = 'pendente' and id <> v_payment.id;
  end if;

  v_order_label := format('Pedido #%s', v_order.order_number);

  if v_effective_status <> 'pendente' and v_generated_credit_amount > 0 then
    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) + v_generated_credit_amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      p_order_id,
      v_payment.id,
      'credit_generated',
      v_generated_credit_amount,
      format('Crédito gerado por pagamento excedente - %s', v_order_label),
      v_actor
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'despesa',
        'ajuste',
        v_generated_credit_amount,
        'pago',
        null,
        format('Crédito gerado por pagamento excedente - %s', v_order_label),
        now(),
        p_order_id,
        true,
        v_actor,
        v_actor
      );
    end if;
  end if;

  if v_effective_status <> 'pendente' and v_order.company_id is not null then
    insert into public.financial_entries (
      company_id,
      type,
      origin,
      amount,
      status,
      payment_method,
      description,
      occurred_at,
      related_id,
      is_automatic,
      created_by,
      updated_by
    )
    values (
      v_order.company_id,
      'receita',
      'order_payment',
      p_amount,
      'pago',
      p_method,
      format('Pagamento recebido - %s', v_order_label),
      coalesce(v_paid_at, now()),
      p_order_id,
      true,
      v_actor,
      v_actor
    );
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  update public.orders
  set amount_paid = v_cash_paid_total,
      customer_credit_used = v_credit_used_total,
      customer_credit_generated = v_generated_credit_total,
      payment_status = v_payment_status,
      payment_method = coalesce(p_method, payment_method),
      updated_at = now(),
      updated_by = v_actor
  where id = p_order_id
  returning *
    into v_order;

  if v_order.company_id is not null then
    insert into public.order_notifications (
      company_id,
      order_id,
      type,
      title,
      body
    )
    values (
      v_order.company_id,
      p_order_id,
      'payment',
      format('Pagamento recebido - %s', v_order_label),
      format('Pagamento de R$ %s registrado.', trim(to_char(p_amount, 'FM999999990.00')))
    );
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'summary', jsonb_build_object(
      'orderTotal', coalesce(v_order.total, 0),
      'paidTotal', coalesce(v_cash_paid_total, 0),
      'creditUsedTotal', coalesce(v_credit_used_total, 0),
      'settledTotal', coalesce(v_settled_total, 0),
      'remaining', coalesce(v_remaining, 0),
      'paymentStatus', v_payment_status,
      'generatedCreditTotal', coalesce(v_generated_credit_total, 0)
    ),
    'orderNumber', v_order.order_number
  );
end;
$$;

create or replace function public.apply_customer_credit_to_order(
  p_order_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_cash_paid_total numeric(10,2) := 0;
  v_credit_used_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_remaining numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_generated_credit_total numeric(10,2) := 0;
  v_available_credit numeric(10,2) := 0;
  v_order_label text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor inválido';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'super_admin'::public.app_role)
    or v_order.company_id = public.current_company_id()
  ) then
    raise exception 'Acesso negado';
  end if;

  if v_order.customer_id is null then
    raise exception 'Associe um cliente ao pedido para usar saldo';
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  if v_remaining <= 0 then
    raise exception 'Pedido já está quitado';
  end if;

  if p_amount > v_remaining then
    raise exception 'Valor excede o saldo restante';
  end if;

  select coalesce(saldo_credito, 0)
    into v_available_credit
  from public.customers
  where id = v_order.customer_id
  for update;

  if v_available_credit < p_amount then
    raise exception 'Saldo de crédito insuficiente';
  end if;

  insert into public.order_payments (
    order_id,
    company_id,
    amount,
    status,
    method,
    paid_at,
    created_by,
    notes,
    source,
    generated_credit_amount
  )
  values (
    p_order_id,
    v_order.company_id,
    p_amount,
    'pago',
    null,
    now(),
    v_actor,
    coalesce(p_notes, 'Uso de saldo de crédito do cliente'),
    'customer_credit',
    0
  )
  returning *
    into v_payment;

  update public.customers
  set saldo_credito = coalesce(saldo_credito, 0) - p_amount,
      updated_at = now()
  where id = v_order.customer_id;

  v_order_label := format('Pedido #%s', v_order.order_number);

  insert into public.customer_credit_transactions (
    company_id,
    customer_id,
    order_id,
    payment_id,
    type,
    amount,
    description,
    created_by
  )
  values (
    v_order.company_id,
    v_order.customer_id,
    p_order_id,
    v_payment.id,
    'credit_used',
    p_amount,
    format('Uso de crédito do cliente - %s', v_order_label),
    v_actor
  );

  if v_order.company_id is not null then
    insert into public.financial_entries (
      company_id,
      type,
      origin,
      amount,
      status,
      payment_method,
      description,
      occurred_at,
      related_id,
      is_automatic,
      created_by,
      updated_by
    )
    values (
      v_order.company_id,
      'receita',
      'ajuste',
      p_amount,
      'pago',
      null,
      format('Uso de crédito do cliente - %s', v_order_label),
      now(),
      p_order_id,
      true,
      v_actor,
      v_actor
    );
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  update public.orders
  set amount_paid = v_cash_paid_total,
      customer_credit_used = v_credit_used_total,
      customer_credit_generated = v_generated_credit_total,
      payment_status = v_payment_status,
      updated_at = now(),
      updated_by = v_actor
  where id = p_order_id
  returning *
    into v_order;

  if v_order.company_id is not null then
    insert into public.order_notifications (
      company_id,
      order_id,
      type,
      title,
      body
    )
    values (
      v_order.company_id,
      p_order_id,
      'payment',
      format('Crédito aplicado - %s', v_order_label),
      format('Saldo do cliente de R$ %s utilizado.', trim(to_char(p_amount, 'FM999999990.00')))
    );
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'summary', jsonb_build_object(
      'orderTotal', coalesce(v_order.total, 0),
      'paidTotal', coalesce(v_cash_paid_total, 0),
      'creditUsedTotal', coalesce(v_credit_used_total, 0),
      'settledTotal', coalesce(v_settled_total, 0),
      'remaining', coalesce(v_remaining, 0),
      'paymentStatus', v_payment_status,
      'generatedCreditTotal', coalesce(v_generated_credit_total, 0)
    ),
    'orderNumber', v_order.order_number
  );
end;
$$;

create or replace function public.cancel_order_payment_internal(
  p_order_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_updated_payment public.order_payments%rowtype;
  v_cash_paid_total numeric(10,2) := 0;
  v_credit_used_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_remaining numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_generated_credit_total numeric(10,2) := 0;
  v_customer_balance numeric(10,2) := 0;
  v_order_label text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'super_admin'::public.app_role)
    or v_order.company_id = public.current_company_id()
  ) then
    raise exception 'Acesso negado';
  end if;

  select *
    into v_payment
  from public.order_payments
  where id = p_payment_id
    and order_id = p_order_id;

  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  v_order_label := format('Pedido #%s', v_order.order_number);

  if v_payment.status <> 'pendente' and v_payment.generated_credit_amount > 0 then
    if v_order.customer_id is null then
      raise exception 'Crédito sem cliente vinculado não pode ser revertido';
    end if;

    select coalesce(saldo_credito, 0)
      into v_customer_balance
    from public.customers
    where id = v_order.customer_id
    for update;

    if v_customer_balance < v_payment.generated_credit_amount then
      raise exception 'O crédito gerado por este pagamento já foi utilizado e não pode ser revertido';
    end if;

    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) - v_payment.generated_credit_amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      p_order_id,
      v_payment.id,
      'credit_generated',
      v_payment.generated_credit_amount * -1,
      format('Reversão de crédito gerado - %s', v_order_label),
      v_actor
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'receita',
        'ajuste',
        v_payment.generated_credit_amount,
        'pago',
        null,
        format('Reversão de crédito gerado - %s', v_order_label),
        now(),
        p_order_id,
        true,
        v_actor,
        v_actor
      );
    end if;
  end if;

  if v_payment.status <> 'pendente' and coalesce(v_payment.source, 'manual') = 'customer_credit' then
    if v_order.customer_id is null then
      raise exception 'Crédito sem cliente vinculado não pode ser revertido';
    end if;

    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) + v_payment.amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      p_order_id,
      v_payment.id,
      'credit_used',
      v_payment.amount * -1,
      format('Estorno de uso de crédito - %s', v_order_label),
      v_actor
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'despesa',
        'ajuste',
        v_payment.amount,
        'pago',
        null,
        format('Estorno de uso de crédito - %s', v_order_label),
        now(),
        p_order_id,
        true,
        v_actor,
        v_actor
      );
    end if;
  end if;

  update public.order_payments
  set status = 'pendente',
      paid_at = null
  where id = p_payment_id
    and order_id = p_order_id
  returning *
    into v_updated_payment;

  if v_payment.status <> 'pendente'
    and coalesce(v_payment.source, 'manual') <> 'customer_credit'
    and v_order.company_id is not null then
    insert into public.financial_entries (
      company_id,
      type,
      origin,
      amount,
      status,
      payment_method,
      description,
      occurred_at,
      related_id,
      is_automatic,
      created_by,
      updated_by
    )
    values (
      v_order.company_id,
      'despesa',
      'order_payment_cancel',
      v_payment.amount,
      'pago',
      v_payment.method,
      format('Pagamento cancelado - %s', v_order_label),
      now(),
      p_order_id,
      true,
      v_actor,
      v_actor
    );
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  update public.orders
  set amount_paid = v_cash_paid_total,
      customer_credit_used = v_credit_used_total,
      customer_credit_generated = v_generated_credit_total,
      payment_status = v_payment_status,
      updated_at = now(),
      updated_by = v_actor
  where id = p_order_id
  returning *
    into v_order;

  if v_order.company_id is not null then
    insert into public.order_notifications (
      company_id,
      order_id,
      type,
      title,
      body
    )
    values (
      v_order.company_id,
      p_order_id,
      'payment',
      format('Pagamento cancelado - %s', v_order_label),
      'Um pagamento foi cancelado.'
    );
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_updated_payment),
    'summary', jsonb_build_object(
      'orderTotal', coalesce(v_order.total, 0),
      'paidTotal', coalesce(v_cash_paid_total, 0),
      'creditUsedTotal', coalesce(v_credit_used_total, 0),
      'settledTotal', coalesce(v_settled_total, 0),
      'remaining', coalesce(v_remaining, 0),
      'paymentStatus', v_payment_status,
      'generatedCreditTotal', coalesce(v_generated_credit_total, 0)
    ),
    'orderNumber', v_order.order_number
  );
end;
$$;

create or replace function public.delete_order_payment_internal(
  p_order_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_deleted_payment public.order_payments%rowtype;
  v_cash_paid_total numeric(10,2) := 0;
  v_credit_used_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_remaining numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_generated_credit_total numeric(10,2) := 0;
  v_customer_balance numeric(10,2) := 0;
  v_order_label text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'super_admin'::public.app_role)
    or v_order.company_id = public.current_company_id()
  ) then
    raise exception 'Acesso negado';
  end if;

  select *
    into v_payment
  from public.order_payments
  where id = p_payment_id
    and order_id = p_order_id;

  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  v_order_label := format('Pedido #%s', v_order.order_number);

  if v_payment.status <> 'pendente' and v_payment.generated_credit_amount > 0 then
    if v_order.customer_id is null then
      raise exception 'Crédito sem cliente vinculado não pode ser revertido';
    end if;

    select coalesce(saldo_credito, 0)
      into v_customer_balance
    from public.customers
    where id = v_order.customer_id
    for update;

    if v_customer_balance < v_payment.generated_credit_amount then
      raise exception 'O crédito gerado por este pagamento já foi utilizado e não pode ser revertido';
    end if;

    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) - v_payment.generated_credit_amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      p_order_id,
      v_payment.id,
      'credit_generated',
      v_payment.generated_credit_amount * -1,
      format('Reversão de crédito gerado - %s', v_order_label),
      v_actor
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'receita',
        'ajuste',
        v_payment.generated_credit_amount,
        'pago',
        null,
        format('Reversão de crédito gerado - %s', v_order_label),
        now(),
        p_order_id,
        true,
        v_actor,
        v_actor
      );
    end if;
  end if;

  if v_payment.status <> 'pendente' and coalesce(v_payment.source, 'manual') = 'customer_credit' then
    if v_order.customer_id is null then
      raise exception 'Crédito sem cliente vinculado não pode ser revertido';
    end if;

    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) + v_payment.amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      p_order_id,
      v_payment.id,
      'credit_used',
      v_payment.amount * -1,
      format('Estorno de uso de crédito - %s', v_order_label),
      v_actor
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'despesa',
        'ajuste',
        v_payment.amount,
        'pago',
        null,
        format('Estorno de uso de crédito - %s', v_order_label),
        now(),
        p_order_id,
        true,
        v_actor,
        v_actor
      );
    end if;
  end if;

  delete from public.order_payments
  where id = p_payment_id
    and order_id = p_order_id
  returning *
    into v_deleted_payment;

  if v_payment.status <> 'pendente'
    and coalesce(v_payment.source, 'manual') <> 'customer_credit'
    and v_order.company_id is not null then
    insert into public.financial_entries (
      company_id,
      type,
      origin,
      amount,
      status,
      payment_method,
      description,
      occurred_at,
      related_id,
      is_automatic,
      created_by,
      updated_by
    )
    values (
      v_order.company_id,
      'despesa',
      'order_payment_delete',
      v_payment.amount,
      'pago',
      v_payment.method,
      format('Pagamento excluído - %s', v_order_label),
      now(),
      p_order_id,
      true,
      v_actor,
      v_actor
    );
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(p_order_id);

  update public.orders
  set amount_paid = v_cash_paid_total,
      customer_credit_used = v_credit_used_total,
      customer_credit_generated = v_generated_credit_total,
      payment_status = v_payment_status,
      updated_at = now(),
      updated_by = v_actor
  where id = p_order_id
  returning *
    into v_order;

  if v_order.company_id is not null then
    insert into public.order_notifications (
      company_id,
      order_id,
      type,
      title,
      body
    )
    values (
      v_order.company_id,
      p_order_id,
      'payment',
      format('Pagamento excluído - %s', v_order_label),
      'Um pagamento foi removido.'
    );
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_deleted_payment),
    'summary', jsonb_build_object(
      'orderTotal', coalesce(v_order.total, 0),
      'paidTotal', coalesce(v_cash_paid_total, 0),
      'creditUsedTotal', coalesce(v_credit_used_total, 0),
      'settledTotal', coalesce(v_settled_total, 0),
      'remaining', coalesce(v_remaining, 0),
      'paymentStatus', v_payment_status,
      'generatedCreditTotal', coalesce(v_generated_credit_total, 0)
    ),
    'orderNumber', v_order.order_number
  );
end;
$$;

create or replace function public.record_order_payment_by_token(
  p_token text,
  p_amount numeric,
  p_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_cash_paid_total numeric(10,2) := 0;
  v_credit_used_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_remaining numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_generated_credit_total numeric(10,2) := 0;
  v_generated_credit_amount numeric(10,2) := 0;
  v_order_label text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    raise exception 'Invalid token';
  end if;

  select *
    into v_order
  from public.orders
  where id = v_order_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(v_order_id);

  if v_remaining <= 0 then
    raise exception 'Pedido já está quitado';
  end if;

  if p_amount > v_remaining then
    if v_order.customer_id is null then
      raise exception 'Associe um cliente ao pedido para gerar crédito do excedente';
    end if;
    v_generated_credit_amount := p_amount - v_remaining;
  end if;

  insert into public.order_payments (
    order_id,
    company_id,
    amount,
    status,
    method,
    paid_at,
    created_by,
    source,
    generated_credit_amount
  )
  values (
    v_order_id,
    v_order.company_id,
    p_amount,
    'pago',
    p_method,
    now(),
    null,
    'manual',
    v_generated_credit_amount
  )
  returning *
    into v_payment;

  v_order_label := format('Pedido #%s', v_order.order_number);

  if v_generated_credit_amount > 0 then
    update public.customers
    set saldo_credito = coalesce(saldo_credito, 0) + v_generated_credit_amount,
        updated_at = now()
    where id = v_order.customer_id;

    insert into public.customer_credit_transactions (
      company_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_order.company_id,
      v_order.customer_id,
      v_order_id,
      v_payment.id,
      'credit_generated',
      v_generated_credit_amount,
      format('Crédito gerado por pagamento excedente - %s', v_order_label),
      null
    );

    if v_order.company_id is not null then
      insert into public.financial_entries (
        company_id,
        type,
        origin,
        amount,
        status,
        payment_method,
        description,
        occurred_at,
        related_id,
        is_automatic,
        created_by,
        updated_by
      )
      values (
        v_order.company_id,
        'despesa',
        'ajuste',
        v_generated_credit_amount,
        'pago',
        null,
        format('Crédito gerado por pagamento excedente - %s', v_order_label),
        now(),
        v_order_id,
        true,
        null,
        null
      );
    end if;
  end if;

  if v_order.company_id is not null then
    insert into public.financial_entries (
      company_id,
      type,
      origin,
      amount,
      status,
      payment_method,
      description,
      occurred_at,
      related_id,
      is_automatic,
      created_by,
      updated_by
    )
    values (
      v_order.company_id,
      'receita',
      'order_payment',
      p_amount,
      'pago',
      p_method,
      format('Pagamento recebido - %s', v_order_label),
      now(),
      v_order_id,
      true,
      null,
      null
    );
  end if;

  select
    cash_paid_total,
    credit_used_total,
    settled_total,
    remaining,
    payment_status,
    generated_credit_total
    into
      v_cash_paid_total,
      v_credit_used_total,
      v_settled_total,
      v_remaining,
      v_payment_status,
      v_generated_credit_total
  from public.get_order_payment_summary_data(v_order_id);

  update public.orders
  set amount_paid = v_cash_paid_total,
      customer_credit_used = v_credit_used_total,
      customer_credit_generated = v_generated_credit_total,
      payment_status = v_payment_status,
      payment_method = coalesce(p_method, payment_method),
      updated_at = now()
  where id = v_order_id;

  insert into public.order_notifications (
    company_id,
    order_id,
    type,
    title,
    body
  )
  values (
    v_order.company_id,
    v_order_id,
    'payment',
    'Pagamento recebido',
    format('Pagamento registrado para o pedido #%s.', v_order.order_number)
  );

  return public.get_public_order(p_token);
end;
$$;

create or replace function public.get_public_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  result jsonb;
begin
  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'total', o.total,
      'payment_status', o.payment_status,
      'payment_method', o.payment_method,
      'amount_paid', o.amount_paid,
      'customer_credit_used', o.customer_credit_used,
      'customer_credit_generated', o.customer_credit_generated,
      'gateway', to_jsonb(o) -> 'gateway',
      'gateway_order_id', to_jsonb(o) -> 'gateway_order_id',
      'payment_link_id', to_jsonb(o) -> 'payment_link_id',
      'payment_link_url', to_jsonb(o) -> 'payment_link_url',
      'payment_id', to_jsonb(o) -> 'payment_id',
      'payment_qr_code', to_jsonb(o) -> 'payment_qr_code',
      'payment_copy_paste', to_jsonb(o) -> 'payment_copy_paste',
      'paid_at', to_jsonb(o) -> 'paid_at',
      'notes', o.notes,
      'created_at', o.created_at,
      'approved_at', o.approved_at,
      'production_time_days_used', o.production_time_days_used,
      'estimated_delivery_date', o.estimated_delivery_date
    ),
    'customer', jsonb_build_object(
      'name', coalesce(c.name, o.customer_name),
      'document', c.document,
      'phone', c.phone,
      'email', c.email
    ),
    'company', jsonb_build_object(
      'name', co.name,
      'logo_url', co.logo_url,
      'phone', co.phone,
      'whatsapp', co.whatsapp,
      'email', co.email,
      'address', co.address,
      'city', co.city,
      'state', co.state
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'discount', oi.discount,
        'total', oi.total,
        'attributes', oi.attributes,
        'notes', oi.notes,
        'created_at', oi.created_at
      ))
      from public.order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'status', h.status,
        'notes', h.notes,
        'created_at', h.created_at
      ) order by h.created_at desc)
      from public.order_status_history h
      where h.order_id = o.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'amount', p.amount,
        'status', p.status,
        'method', p.method,
        'paid_at', p.paid_at,
        'created_at', p.created_at,
        'notes', p.notes,
        'source', p.source,
        'generated_credit_amount', p.generated_credit_amount,
        'gateway', to_jsonb(p) -> 'gateway',
        'gateway_order_id', to_jsonb(p) -> 'gateway_order_id',
        'gateway_transaction_id', to_jsonb(p) -> 'gateway_transaction_id',
        'raw_payload', to_jsonb(p) -> 'raw_payload'
      ) order by p.created_at desc)
      from public.order_payments p
      where p.order_id = o.id
    ), '[]'::jsonb),
    'final_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'order_id', f.order_id,
        'storage_path', f.storage_path,
        'created_by', f.created_by,
        'created_at', f.created_at
      ) order by f.created_at desc)
      from public.order_final_photos f
      where f.order_id = o.id
    ), '[]'::jsonb),
    'art_files', case
      when o.status in (
        'produzindo_arte',
        'arte_aprovada',
        'em_producao',
        'finalizado',
        'pronto',
        'aguardando_retirada',
        'entregue'
      ) then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', af.id,
          'order_id', af.order_id,
          'storage_path', af.storage_path,
          'file_name', af.file_name,
          'file_type', af.file_type,
          'created_by', af.created_by,
          'created_at', af.created_at
        ) order by af.created_at desc)
        from public.order_art_files af
        where af.order_id = o.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  into result
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join public.companies co on co.id = o.company_id
  where o.id = v_order_id;

  return result;
end $$;
