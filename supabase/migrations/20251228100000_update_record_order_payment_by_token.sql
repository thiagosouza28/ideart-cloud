-- Enforce remaining balance checks when recording public payments.

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
  v_company_id uuid;
  v_order_number integer;
  v_order_total numeric(10,2);
  v_paid_total numeric(10,2);
  v_remaining numeric(10,2);
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

  select company_id, total, order_number
    into v_company_id, v_order_total, v_order_number
  from public.orders
  where id = v_order_id;

  select coalesce(sum(amount), 0)
    into v_paid_total
  from public.order_payments
  where order_id = v_order_id
    and status <> 'pendente';

  v_remaining := v_order_total - v_paid_total;

  if v_remaining <= 0 then
    raise exception 'Pedido ja esta quitado';
  end if;

  if p_amount > v_remaining then
    raise exception 'Valor excede o saldo restante';
  end if;

  insert into public.order_payments (
    order_id,
    company_id,
    amount,
    status,
    method,
    paid_at,
    created_by
  )
  values (
    v_order_id,
    v_company_id,
    p_amount,
    'pago',
    p_method,
    now(),
    null
  );

  v_paid_total := v_paid_total + p_amount;

  update public.orders
  set amount_paid = v_paid_total,
      payment_status = case
        when v_paid_total >= v_order_total then 'pago'
        else 'parcial'
      end,
      payment_method = coalesce(p_method, payment_method),
      updated_at = now()
  where id = v_order_id;

  insert into public.order_notifications (company_id, order_id, type, title, body)
  values (
    v_company_id,
    v_order_id,
    'payment',
    'Pagamento recebido',
    format('Pagamento registrado para o pedido #%s.', v_order_number)
  );

  return public.get_public_order(p_token);
end $$;
