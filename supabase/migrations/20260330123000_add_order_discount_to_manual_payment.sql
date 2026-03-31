drop function if exists public.record_order_payment_internal(
  uuid,
  numeric,
  public.payment_method,
  public.payment_status,
  text,
  timestamptz
);

drop function if exists public.record_order_payment_internal(
  uuid,
  numeric,
  public.payment_method,
  public.payment_status,
  text,
  timestamptz,
  text,
  numeric
);

create or replace function public.record_order_payment_internal(
  p_order_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_status public.payment_status default 'pago',
  p_notes text default null,
  p_paid_at timestamptz default null,
  p_order_discount_type text default null,
  p_order_discount_value numeric default null
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
  v_requested_discount_type text;
  v_requested_discount_value numeric(10,2) := 0;
  v_requested_discount_amount numeric(10,2) := 0;
  v_requested_total numeric(10,2) := 0;
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
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'super_admin'::public.app_role)
    or v_order.company_id = public.current_company_id()
  ) then
    raise exception 'Acesso negado';
  end if;

  v_requested_discount_type := coalesce(
    nullif(trim(p_order_discount_type), ''),
    nullif(trim(v_order.discount_type), ''),
    'fixed'
  );
  v_requested_discount_value := greatest(0, coalesce(p_order_discount_value, v_order.discount_value, 0));

  if v_requested_discount_type not in ('fixed', 'percent') then
    raise exception 'Tipo de desconto inválido';
  end if;

  v_requested_discount_amount :=
    case
      when v_requested_discount_type = 'percent' then
        round(coalesce(v_order.subtotal, 0) * least(v_requested_discount_value, 100) / 100, 2)
      else
        least(coalesce(v_order.subtotal, 0), v_requested_discount_value)
    end;

  v_requested_total := greatest(0, round(coalesce(v_order.subtotal, 0) - v_requested_discount_amount, 2));

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

  if v_settled_total > v_requested_total then
    raise exception 'O desconto não pode reduzir o total abaixo do valor já quitado';
  end if;

  if p_order_discount_type is not null or p_order_discount_value is not null then
    update public.orders
    set
      discount_type = v_requested_discount_type,
      discount_value = v_requested_discount_value,
      discount = v_requested_discount_amount,
      total = v_requested_total,
      payment_status = case
        when v_settled_total >= v_requested_total and v_requested_total > 0 then 'pago'::public.payment_status
        when v_settled_total > 0 then 'parcial'::public.payment_status
        else 'pendente'::public.payment_status
      end,
      updated_at = now(),
      updated_by = v_actor
    where id = p_order_id
    returning *
      into v_order;
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
    v_paid_at := coalesce(p_paid_at, now());
  end if;

  select *
    into v_payment
  from public.order_payments
  where order_id = p_order_id
    and status = 'pendente'
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
    where order_id = p_order_id
      and status = 'pendente'
      and id <> v_payment.id;
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
        coalesce(v_paid_at, now()),
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

grant execute on function public.record_order_payment_internal(
  uuid,
  numeric,
  public.payment_method,
  public.payment_status,
  text,
  timestamptz,
  text,
  numeric
) to authenticated;
