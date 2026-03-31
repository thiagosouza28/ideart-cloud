alter table public.orders
  add column if not exists merged_into_order_id uuid,
  add column if not exists merged_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_merged_into_order_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_merged_into_order_id_fkey
      foreign key (merged_into_order_id)
      references public.orders(id)
      on delete set null;
  end if;
end $$;

create index if not exists orders_merged_into_order_id_idx
  on public.orders(merged_into_order_id);

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

  select
    coalesce(sum(greatest(0, coalesce(discount, 0))), 0),
    coalesce(
      string_agg(
        '#' || lpad(coalesce(order_number, 0)::text, 5, '0'),
        ', '
        order by created_at
      ),
      ''
    )
    into v_source_discount, v_source_numbers
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
  v_total := greatest(0, round(v_subtotal - v_combined_discount, 2));
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

  insert into public.order_notifications (
    company_id,
    order_id,
    type,
    title,
    body
  )
  values (
    v_target.company_id,
    p_target_order_id,
    'order_merge',
    format('Pedidos agrupados - Pedido #%s', lpad(coalesce(v_target.order_number, 0)::text, 5, '0')),
    format('Pedidos agrupados ao pedido principal: %s', v_source_numbers)
  );

  return v_target;
end;
$$;

grant execute on function public.merge_customer_orders(uuid, uuid[], uuid) to authenticated;
