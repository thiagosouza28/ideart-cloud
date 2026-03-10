-- Fix: Do NOT create financial_entries when customer credit is used to pay an order.
-- The credit money already entered the cash register when the customer originally overpaid.
-- Creating a new "receita" entry would double-count that income.
-- Also remove the reversal "despesa" entry when canceling a credit payment.

-- 1. Replace apply_customer_credit_to_order WITHOUT the financial_entry insert
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

  -- NOTE: We intentionally do NOT create a financial_entry here.
  -- The credit money already entered the cash register when the customer
  -- originally overpaid. Creating a new entry would double-count income.

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

-- 2. Replace cancel_order_payment_internal to NOT create financial_entries for credit reversals
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

  -- Handle generated credit reversal (from overpayment)
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

    -- Reverse the despesa that was created when credit was generated
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

  -- Handle customer credit payment reversal
  if v_payment.status <> 'pendente' and coalesce(v_payment.source, 'manual') = 'customer_credit' then
    if v_order.customer_id is null then
      raise exception 'Crédito sem cliente vinculado não pode ser revertido';
    end if;

    -- Restore the customer's credit balance
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

    -- NOTE: We intentionally do NOT create a financial_entry here.
    -- No cash was involved when credit was used, so no cash reversal needed.
  end if;

  -- Mark payment as pending (canceled)
  update public.order_payments
  set status = 'pendente',
      paid_at = null
  where id = p_payment_id
    and order_id = p_order_id
  returning *
    into v_updated_payment;

  -- Handle regular (non-credit) payment reversal financial entry
  if v_payment.status <> 'pendente'
    and coalesce(v_payment.source, 'manual') <> 'customer_credit'
    and v_order.company_id is not null
  then
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
      format('Estorno de pagamento - %s', v_order_label),
      now(),
      p_order_id,
      true,
      v_actor,
      v_actor
    );
  end if;

  -- Recalculate order totals
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

-- 3. Clean up any existing financial_entries that were incorrectly created
-- when customer credit was used. These entries double-counted income.
-- Temporarily disable the trigger that prevents deleting automatic entries.
alter table public.financial_entries disable trigger trg_financial_entries_prevent_delete_auto;

delete from public.financial_entries
where is_automatic = true
  and origin = 'ajuste'
  and description like '%Uso de crédito do cliente%';

delete from public.financial_entries
where is_automatic = true
  and origin = 'ajuste'
  and description like '%Estorno de uso de crédito%';

-- Re-enable the trigger
alter table public.financial_entries enable trigger trg_financial_entries_prevent_delete_auto;
