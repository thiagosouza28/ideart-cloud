-- Add art/production statuses and align defaults.

alter type public.order_status
  add value if not exists 'produzindo_arte' after 'pendente';

alter type public.order_status
  add value if not exists 'arte_aprovada' after 'produzindo_arte';

alter type public.order_status
  add value if not exists 'finalizado' after 'em_producao';

alter table public.orders
  alter column status set default 'pendente'::public.order_status;

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

  if v_order.status not in ('orcamento', 'pendente') then
    raise exception 'Pedido nao pode ser alterado apos sair do status Orcamento/Pendente';
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

create or replace function public.approve_order_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_company_id uuid;
  v_order_number integer;
  v_current_status public.order_status;
  v_approved_at timestamp with time zone;
begin
  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    raise exception 'Invalid token';
  end if;

  select company_id, order_number, status, approved_at
    into v_company_id, v_order_number, v_current_status, v_approved_at
  from public.orders
  where id = v_order_id;

  if v_current_status not in ('orcamento', 'pendente') then
    return public.get_public_order(p_token);
  end if;

  update public.orders
  set status = case when v_current_status = 'orcamento' then 'pendente' else v_current_status end,
      approved_at = coalesce(approved_at, now()),
      approved_by = coalesce(approved_by, 'cliente'),
      updated_at = now()
  where id = v_order_id;

  if v_approved_at is null then
    insert into public.order_status_history (order_id, status, notes, user_id)
    values (v_order_id, 'pendente', 'Orcamento aprovado pelo cliente', null);

    insert into public.order_notifications (company_id, order_id, type, title, body)
    values (
      v_company_id,
      v_order_id,
      'approval',
      'Orcamento aprovado',
      format('Pedido #%s aprovado pelo cliente.', v_order_number)
    );
  end if;

  return public.get_public_order(p_token);
end $$;
