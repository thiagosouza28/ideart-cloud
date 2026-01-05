create or replace function public.update_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
as $$
declare
  v_order public.orders;
  v_subtotal numeric := 0;
  v_total numeric := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_order.status <> 'orcamento' then
    raise exception 'Pedido não pode ser alterado após sair do status Orçamento';
  end if;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    discount,
    total,
    attributes,
    notes
  )
  select
    p_order_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_name',
    greatest(1, (item->>'quantity')::int),
    (item->>'unit_price')::numeric,
    coalesce((item->>'discount')::numeric, 0),
    greatest(0, (item->>'quantity')::numeric * (item->>'unit_price')::numeric - coalesce((item->>'discount')::numeric, 0)),
    case when item ? 'attributes' then item->'attributes' else null end,
    nullif(item->>'notes', '')
  from jsonb_array_elements(p_items) as item;

  select coalesce(sum(total), 0)
    into v_subtotal
  from public.order_items
  where order_id = p_order_id;

  v_total := greatest(0, v_subtotal - coalesce(v_order.discount, 0));

  update public.orders
    set subtotal = v_subtotal,
        total = v_total,
        updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;
