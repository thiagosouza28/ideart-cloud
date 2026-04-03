alter table public.orders
  add column if not exists freight_amount numeric(10,2) not null default 0,
  add column if not exists delivery_method text not null default 'retirada',
  add column if not exists payment_condition text not null default 'avista',
  add column if not exists priority text not null default 'normal',
  add column if not exists responsible_id uuid;

update public.orders
set
  freight_amount = greatest(0, coalesce(freight_amount, 0)),
  delivery_method = coalesce(nullif(trim(delivery_method), ''), 'retirada'),
  payment_condition = coalesce(nullif(trim(payment_condition), ''), 'avista'),
  priority = coalesce(nullif(trim(priority), ''), 'normal')
where
  freight_amount is null
  or delivery_method is null
  or trim(delivery_method) = ''
  or payment_condition is null
  or trim(payment_condition) = ''
  or priority is null
  or trim(priority) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_freight_amount_non_negative'
  ) then
    alter table public.orders
      add constraint orders_freight_amount_non_negative
      check (freight_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_method_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_method_check
      check (delivery_method in ('retirada', 'entrega', 'motoboy'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_priority_check'
  ) then
    alter table public.orders
      add constraint orders_priority_check
      check (priority in ('baixa', 'normal', 'alta'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_responsible_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_responsible_id_fkey
      foreign key (responsible_id)
      references public.profiles(id)
      on delete set null;
  end if;
end $$;

create index if not exists orders_responsible_id_idx
  on public.orders(responsible_id);

drop function if exists public.update_order_items(
  uuid,
  jsonb,
  text,
  numeric
);

create or replace function public.update_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_order_discount_type text default null,
  p_order_discount_value numeric default null,
  p_freight_amount numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order public.orders;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_settled_total numeric := 0;
  v_order_discount_type text := coalesce(nullif(trim(p_order_discount_type), ''), 'fixed');
  v_order_discount_value numeric := greatest(0, coalesce(p_order_discount_value, 0));
  v_order_discount_amount numeric := 0;
  v_freight_amount numeric := 0;
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_order.deleted_at is not null then
    raise exception 'Pedido excluido';
  end if;

  if v_order.status not in ('orcamento', 'pendente') then
    raise exception 'Pedido nao pode ser alterado apos sair do status Orcamento/Pendente';
  end if;

  if v_order_discount_type not in ('fixed', 'percent') then
    raise exception 'Tipo de desconto invalido';
  end if;

  v_freight_amount := greatest(0, coalesce(p_freight_amount, v_order.freight_amount, 0));

  drop table if exists tmp_existing_order_items;

  create temporary table tmp_existing_order_items on commit drop as
  select
    oi.id,
    oi.status,
    oi.ready_at,
    oi.ready_by,
    oi.delivered_at,
    oi.delivered_by
  from public.order_items oi
  where oi.order_id = p_order_id;

  delete from public.order_items
  where order_id = p_order_id;

  insert into public.order_items (
    id,
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    discount_type,
    discount_value,
    discount,
    total,
    attributes,
    notes,
    status,
    ready_at,
    ready_by,
    delivered_at,
    delivered_by
  )
  select
    coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid()),
    p_order_id,
    nullif(item->>'product_id', '')::uuid,
    coalesce(nullif(item->>'product_name', ''), 'Item'),
    greatest(0.01, coalesce((item->>'quantity')::numeric, 1)),
    greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
    case
      when coalesce(nullif(trim(item->>'discount_type'), ''), 'fixed') = 'percent' then 'percent'
      else 'fixed'
    end,
    greatest(0, coalesce((item->>'discount_value')::numeric, coalesce((item->>'discount')::numeric, 0))),
    case
      when coalesce(nullif(trim(item->>'discount_type'), ''), 'fixed') = 'percent' then
        round(
          greatest(0, coalesce((item->>'quantity')::numeric, 1)) *
          greatest(0, coalesce((item->>'unit_price')::numeric, 0)) *
          least(greatest(0, coalesce((item->>'discount_value')::numeric, coalesce((item->>'discount')::numeric, 0))), 100) / 100,
          2
        )
      else
        least(
          round(
            greatest(0, coalesce((item->>'quantity')::numeric, 1)) *
            greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
            2
          ),
          greatest(0, coalesce((item->>'discount_value')::numeric, coalesce((item->>'discount')::numeric, 0)))
        )
    end,
    greatest(
      0,
      round(
        greatest(0, coalesce((item->>'quantity')::numeric, 1)) *
        greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
        2
      ) -
      case
        when coalesce(nullif(trim(item->>'discount_type'), ''), 'fixed') = 'percent' then
          round(
            greatest(0, coalesce((item->>'quantity')::numeric, 1)) *
            greatest(0, coalesce((item->>'unit_price')::numeric, 0)) *
            least(greatest(0, coalesce((item->>'discount_value')::numeric, coalesce((item->>'discount')::numeric, 0))), 100) / 100,
            2
          )
        else
          least(
            round(
              greatest(0, coalesce((item->>'quantity')::numeric, 1)) *
              greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
              2
            ),
            greatest(0, coalesce((item->>'discount_value')::numeric, coalesce((item->>'discount')::numeric, 0)))
          )
      end
    ),
    case when item ? 'attributes' then item->'attributes' else null end,
    nullif(item->>'notes', ''),
    coalesce(existing.status, v_order.status, 'orcamento'::public.order_status),
    existing.ready_at,
    existing.ready_by,
    existing.delivered_at,
    existing.delivered_by
  from jsonb_array_elements(p_items) as item
  left join tmp_existing_order_items existing
    on existing.id = nullif(item->>'id', '')::uuid;

  select coalesce(sum(total), 0)
    into v_subtotal
  from public.order_items
  where order_id = p_order_id;

  v_order_discount_amount :=
    case
      when v_order_discount_type = 'percent' then
        round(v_subtotal * least(v_order_discount_value, 100) / 100, 2)
      else
        least(v_subtotal, v_order_discount_value)
    end;

  v_total := greatest(
    0,
    round(v_subtotal - v_order_discount_amount + v_freight_amount, 2)
  );
  v_settled_total := coalesce(v_order.amount_paid, 0) + coalesce(v_order.customer_credit_used, 0);

  update public.orders
  set
    subtotal = v_subtotal,
    discount_type = v_order_discount_type,
    discount_value = v_order_discount_value,
    discount = v_order_discount_amount,
    freight_amount = v_freight_amount,
    total = v_total,
    payment_status = case
      when v_settled_total >= v_total and v_total > 0 then 'pago'::public.payment_status
      when v_settled_total > 0 then 'parcial'::public.payment_status
      else 'pendente'::public.payment_status
    end,
    status = public.compute_order_status_from_items(p_order_id),
    updated_at = now()
  where id = p_order_id
  returning *
    into v_order;

  return v_order;
end;
$$;

grant execute on function public.update_order_items(
  uuid,
  jsonb,
  text,
  numeric,
  numeric
) to authenticated;

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
    raise exception 'Valor invalido';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
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
    raise exception 'Tipo de desconto invalido';
  end if;

  v_requested_discount_amount :=
    case
      when v_requested_discount_type = 'percent' then
        round(coalesce(v_order.subtotal, 0) * least(v_requested_discount_value, 100) / 100, 2)
      else
        least(coalesce(v_order.subtotal, 0), v_requested_discount_value)
    end;

  v_requested_total := greatest(
    0,
    round(
      coalesce(v_order.subtotal, 0) - v_requested_discount_amount + coalesce(v_order.freight_amount, 0),
      2
    )
  );

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
    raise exception 'O desconto nao pode reduzir o total abaixo do valor ja quitado';
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
    raise exception 'Pedido ja esta quitado';
  end if;

  if p_status = 'pendente' and p_amount > v_remaining then
    raise exception 'Valor excede o saldo restante';
  end if;

  if p_status <> 'pendente' and p_amount > v_remaining then
    if v_order.customer_id is null then
      raise exception 'Associe um cliente ao pedido para gerar credito do excedente';
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
      format('Credito gerado por pagamento excedente - %s', v_order_label),
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
        format('Credito gerado por pagamento excedente - %s', v_order_label),
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

create or replace function public.merge_customer_orders(
  p_target_order_id uuid,
  p_source_order_ids uuid[],
  p_user_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_target public.orders;
  v_target_discount numeric := 0;
  v_source_discount numeric := 0;
  v_combined_discount numeric := 0;
  v_target_freight numeric := 0;
  v_source_freight numeric := 0;
  v_combined_freight numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_source_count integer := 0;
  v_source_ids uuid[];
  v_source_numbers text := '';
  v_target_history_note text;
  v_source_history_note text;
begin
  v_source_ids := array(
    select distinct source_id
    from unnest(coalesce(p_source_order_ids, array[]::uuid[])) as source_id
    where source_id is not null
      and source_id <> p_target_order_id
  );

  if coalesce(array_length(v_source_ids, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um pedido para agrupar';
  end if;

  select *
    into v_target
  from public.orders
  where id = p_target_order_id
  for update;

  if not found then
    raise exception 'Pedido principal nao encontrado';
  end if;

  if v_target.deleted_at is not null then
    raise exception 'Pedido principal excluido';
  end if;

  if v_target.customer_id is null then
    raise exception 'Associe um cliente ao pedido principal para agrupar';
  end if;

  if v_target.status = 'cancelado' then
    raise exception 'Pedidos cancelados nao podem ser agrupados';
  end if;

  if coalesce(v_target.amount_paid, 0) > 0
    or coalesce(v_target.customer_credit_used, 0) > 0
    or exists (
      select 1
      from public.order_payments payment
      where payment.order_id = v_target.id
    ) then
    raise exception 'O pedido principal precisa estar sem pagamentos para ser agrupado';
  end if;

  perform 1
  from public.orders
  where id = any(v_source_ids)
  for update;

  create temporary table tmp_merge_source_orders on commit drop as
  select *
  from public.orders
  where id = any(v_source_ids);

  select count(*)
    into v_source_count
  from tmp_merge_source_orders;

  if v_source_count <> array_length(v_source_ids, 1) then
    raise exception 'Um ou mais pedidos selecionados nao foram encontrados';
  end if;

  if exists (
    select 1
    from tmp_merge_source_orders source_order
    where source_order.deleted_at is not null
  ) then
    raise exception 'Nao e possivel agrupar pedidos excluidos';
  end if;

  if exists (
    select 1
    from tmp_merge_source_orders source_order
    where source_order.customer_id is distinct from v_target.customer_id
  ) then
    raise exception 'Somente pedidos do mesmo cliente podem ser agrupados';
  end if;

  if exists (
    select 1
    from tmp_merge_source_orders source_order
    where source_order.company_id is distinct from v_target.company_id
  ) then
    raise exception 'Todos os pedidos precisam pertencer a mesma empresa';
  end if;

  if exists (
    select 1
    from tmp_merge_source_orders source_order
    where source_order.status = 'cancelado'
  ) then
    raise exception 'Pedidos cancelados nao podem ser agrupados';
  end if;

  if exists (
    select 1
    from tmp_merge_source_orders source_order
    where coalesce(source_order.amount_paid, 0) > 0
      or coalesce(source_order.customer_credit_used, 0) > 0
  ) then
    raise exception 'Os pedidos selecionados precisam estar sem pagamentos';
  end if;

  if exists (
    select 1
    from public.order_payments payment
    where payment.order_id = any(v_source_ids)
  ) then
    raise exception 'Os pedidos selecionados precisam estar sem pagamentos';
  end if;

  v_target_discount := greatest(0, coalesce(v_target.discount, 0));
  v_target_freight := greatest(0, coalesce(v_target.freight_amount, 0));

  select
    coalesce(sum(greatest(0, coalesce(discount, 0))), 0),
    coalesce(sum(greatest(0, coalesce(freight_amount, 0))), 0),
    coalesce(
      string_agg(
        '#' || lpad(coalesce(order_number, 0)::text, 5, '0'),
        ', '
        order by created_at
      ),
      ''
    )
    into v_source_discount, v_source_freight, v_source_numbers
  from tmp_merge_source_orders;

  insert into public.order_items (
    id,
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    discount_type,
    discount_value,
    discount,
    total,
    attributes,
    notes,
    status,
    ready_at,
    ready_by,
    delivered_at,
    delivered_by
  )
  select
    gen_random_uuid(),
    p_target_order_id,
    item.product_id,
    item.product_name,
    item.quantity,
    item.unit_price,
    coalesce(nullif(trim(item.discount_type::text), ''), 'fixed'),
    greatest(0, coalesce(item.discount_value, item.discount, 0)),
    greatest(0, coalesce(item.discount, 0)),
    greatest(0, coalesce(item.total, 0)),
    item.attributes,
    item.notes,
    item.status,
    item.ready_at,
    item.ready_by,
    item.delivered_at,
    item.delivered_by
  from public.order_items item
  join tmp_merge_source_orders source_order
    on source_order.id = item.order_id;

  update public.order_art_files
  set order_id = p_target_order_id
  where order_id = any(v_source_ids);

  update public.order_final_photos
  set order_id = p_target_order_id
  where order_id = any(v_source_ids);

  delete from public.order_public_links
  where order_id = any(v_source_ids);

  select coalesce(sum(total), 0)
    into v_subtotal
  from public.order_items
  where order_id = p_target_order_id;

  v_combined_discount := least(v_subtotal, round(v_target_discount + v_source_discount, 2));
  v_combined_freight := round(v_target_freight + v_source_freight, 2);
  v_total := greatest(0, round(v_subtotal - v_combined_discount + v_combined_freight, 2));
  v_target_history_note := format('Pedidos agrupados ao pedido principal: %s', v_source_numbers);
  v_source_history_note := format(
    'Pedido agrupado ao pedido #%s',
    lpad(coalesce(v_target.order_number, 0)::text, 5, '0')
  );

  update public.orders
  set
    subtotal = v_subtotal,
    discount_type = 'fixed',
    discount_value = v_combined_discount,
    discount = v_combined_discount,
    freight_amount = v_combined_freight,
    total = v_total,
    status = public.compute_order_status_from_items(p_target_order_id),
    updated_at = now(),
    updated_by = coalesce(p_user_id, updated_by)
  where id = p_target_order_id
  returning *
    into v_target;

  update public.order_items
  set status = 'cancelado'::public.order_status
  where order_id = any(v_source_ids)
    and status <> 'cancelado';

  update public.orders
  set
    subtotal = 0,
    discount_type = 'fixed',
    discount_value = 0,
    discount = 0,
    freight_amount = 0,
    total = 0,
    amount_paid = 0,
    customer_credit_used = 0,
    customer_credit_generated = 0,
    payment_status = 'pendente'::public.payment_status,
    payment_method = null,
    payment_id = null,
    payment_qr_code = null,
    payment_copy_paste = null,
    paid_at = null,
    status = 'cancelado'::public.order_status,
    cancel_reason = v_source_history_note,
    cancelled_at = coalesce(cancelled_at, now()),
    cancelled_by = coalesce(p_user_id, cancelled_by),
    deleted_at = coalesce(deleted_at, now()),
    deleted_by = coalesce(p_user_id, deleted_by),
    merged_into_order_id = p_target_order_id,
    merged_at = now(),
    updated_at = now(),
    updated_by = coalesce(p_user_id, updated_by)
  where id = any(v_source_ids);

  insert into public.order_status_history (
    order_id,
    status,
    user_id,
    notes
  )
  values (
    p_target_order_id,
    v_target.status,
    p_user_id,
    v_target_history_note
  );

  insert into public.order_status_history (
    order_id,
    status,
    user_id,
    notes
  )
  select
    source_order.id,
    'cancelado'::public.order_status,
    p_user_id,
    v_source_history_note
  from tmp_merge_source_orders source_order;

  return v_target;
end;
$$;
