alter table public.orders
  add column if not exists discount_type text not null default 'fixed',
  add column if not exists discount_value numeric(10,2) not null default 0;

alter table public.order_items
  add column if not exists discount_type text not null default 'fixed',
  add column if not exists discount_value numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_discount_type_check'
  ) then
    alter table public.orders
      add constraint orders_discount_type_check
      check (discount_type in ('fixed', 'percent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_discount_type_check'
  ) then
    alter table public.order_items
      add constraint order_items_discount_type_check
      check (discount_type in ('fixed', 'percent'));
  end if;
end $$;

update public.orders
set
  discount_type = coalesce(nullif(discount_type, ''), 'fixed'),
  discount_value = case
    when coalesce(discount_value, 0) > 0 then discount_value
    else coalesce(discount, 0)
  end;

update public.order_items
set
  discount_type = coalesce(nullif(discount_type, ''), 'fixed'),
  discount_value = case
    when coalesce(discount_value, 0) > 0 then discount_value
    else coalesce(discount, 0)
  end;

create or replace function public.update_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_order_discount_type text default null,
  p_order_discount_value numeric default null
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
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.deleted_at is not null then
    raise exception 'Pedido excluído';
  end if;

  if v_order.status not in ('orcamento', 'pendente') then
    raise exception 'Pedido não pode ser alterado após sair do status Orçamento/Pendente';
  end if;

  if v_order_discount_type not in ('fixed', 'percent') then
    raise exception 'Tipo de desconto inválido';
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  insert into public.order_items (
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
    notes
  )
  select
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
    nullif(item->>'notes', '')
  from jsonb_array_elements(p_items) as item;

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

  v_total := greatest(0, round(v_subtotal - v_order_discount_amount, 2));
  v_settled_total := coalesce(v_order.amount_paid, 0) + coalesce(v_order.customer_credit_used, 0);

  update public.orders
  set
    subtotal = v_subtotal,
    discount_type = v_order_discount_type,
    discount_value = v_order_discount_value,
    discount = v_order_discount_amount,
    total = v_total,
    payment_status = case
      when v_settled_total >= v_total and v_total > 0 then 'pago'::public.payment_status
      when v_settled_total > 0 then 'parcial'::public.payment_status
      else 'pendente'::public.payment_status
    end,
    updated_at = now()
  where id = p_order_id
  returning *
    into v_order;

  return v_order;
end;
$$;
