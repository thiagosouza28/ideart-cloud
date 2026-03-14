alter table public.order_items
  add column if not exists delivered_at timestamptz null,
  add column if not exists delivered_by uuid null references auth.users(id) on delete set null;

create index if not exists order_items_order_delivery_idx
  on public.order_items(order_id, delivered_at, created_at);

update public.order_items oi
set
  delivered_at = coalesce(
    oi.delivered_at,
    o.delivered_at,
    delivered_history.created_at,
    o.updated_at,
    o.created_at
  ),
  delivered_by = coalesce(oi.delivered_by, o.delivered_by)
from public.orders o
left join lateral (
  select h.created_at
  from public.order_status_history h
  where h.order_id = o.id
    and h.status = 'entregue'
  order by h.created_at desc
  limit 1
) as delivered_history on true
where oi.order_id = o.id
  and o.status = 'entregue'
  and oi.delivered_at is null;

create or replace function public.mark_order_items_delivered(
  p_order_id uuid,
  p_item_ids uuid[],
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_actor_company_id uuid;
  v_actor_role text;
  v_order public.orders%rowtype;
  v_result_order public.orders%rowtype;
  v_now timestamptz := now();
  v_pending_count integer := 0;
  v_total_count integer := 0;
  v_updated_count integer := 0;
  v_updated_ids uuid[] := '{}'::uuid[];
  v_updated_names text := null;
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select p.company_id
    into v_actor_company_id
  from public.profiles p
  where p.id = v_actor_id;

  select ur.role::text
    into v_actor_role
  from public.user_roles ur
  where ur.user_id = v_actor_id
    and ur.role in ('admin', 'atendente', 'caixa', 'producao')
  limit 1;

  if v_actor_company_id is null or v_actor_role is null then
    raise exception 'Sem permissão para registrar a entrega';
  end if;

  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um item para entregar';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.company_id is null or v_order.company_id <> v_actor_company_id then
    raise exception 'Sem permissão para este pedido';
  end if;

  if v_order.status not in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue') then
    raise exception 'O pedido precisa estar pronto para registrar a entrega';
  end if;

  with updated_items as (
    update public.order_items
    set
      delivered_at = coalesce(delivered_at, v_now),
      delivered_by = coalesce(delivered_by, v_actor_id)
    where order_id = p_order_id
      and id = any(p_item_ids)
      and delivered_at is null
    returning id, product_name
  )
  select
    coalesce(array_agg(id), '{}'::uuid[]),
    string_agg(product_name, ', ' order by product_name),
    count(*)
  into
    v_updated_ids,
    v_updated_names,
    v_updated_count
  from updated_items;

  if v_updated_count = 0 then
    raise exception 'Os itens selecionados já foram entregues';
  end if;

  select
    count(*),
    count(*) filter (where delivered_at is null)
  into
    v_total_count,
    v_pending_count
  from public.order_items
  where order_id = p_order_id;

  if v_total_count = 0 then
    raise exception 'Pedido sem itens';
  end if;

  if v_pending_count = 0 then
    update public.orders
    set
      status = 'entregue',
      delivered_at = coalesce(delivered_at, v_now),
      delivered_by = coalesce(delivered_by, v_actor_id),
      updated_by = v_actor_id
    where id = p_order_id
    returning *
      into v_result_order;

    if v_order.status is distinct from 'entregue' then
      insert into public.order_status_history (
        order_id,
        status,
        user_id,
        notes
      )
      values (
        p_order_id,
        'entregue',
        v_actor_id,
        case
          when coalesce(v_updated_names, '') <> '' then
            format('Entrega concluída. Itens entregues: %s.', v_updated_names)
          else
            'Entrega concluída.'
        end
      );

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
        'status_change',
        format('Pedido #%s', v_order.order_number),
        'Status alterado para: Entregue'
      );
    end if;
  else
    update public.orders
    set updated_by = v_actor_id
    where id = p_order_id
    returning *
      into v_result_order;

    insert into public.order_status_history (
      order_id,
      status,
      user_id,
      notes
    )
    values (
      p_order_id,
      v_order.status,
      v_actor_id,
      case
        when coalesce(v_updated_names, '') <> '' then
          format('Entrega parcial registrada. Itens entregues: %s.', v_updated_names)
        else
          'Entrega parcial registrada.'
      end
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_result_order),
    'updated_item_ids', to_jsonb(v_updated_ids),
    'delivery_completed', (v_pending_count = 0)
  );
end;
$$;

grant execute on function public.mark_order_items_delivered(uuid, uuid[], uuid) to authenticated;

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
      'estimated_delivery_date', o.estimated_delivery_date,
      'delivered_at', o.delivered_at
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
        'created_at', oi.created_at,
        'delivered_at', oi.delivered_at,
        'delivered_by', oi.delivered_by
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
