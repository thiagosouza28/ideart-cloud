alter table public.order_items
  add column if not exists status public.order_status;

update public.order_items oi
set status = case
  when oi.delivered_at is not null then 'entregue'::public.order_status
  when coalesce(oi.ready_at, oi.delivered_at) is not null then 'finalizado'::public.order_status
  else o.status
end
from public.orders o
where oi.order_id = o.id
  and oi.status is null;

alter table public.order_items
  alter column status set default 'orcamento'::public.order_status;

update public.order_items
set status = 'orcamento'::public.order_status
where status is null;

alter table public.order_items
  alter column status set not null;

create index if not exists order_items_order_status_idx
  on public.order_items(order_id, status, created_at);

create or replace function public.compute_order_status_from_items(
  p_order_id uuid
)
returns public.order_status
language sql
stable
set search_path = 'public'
as $$
  with scoped_items as (
    select status
    from public.order_items
    where order_id = p_order_id
  ),
  totals as (
    select
      count(*) as total_items,
      count(*) filter (where status <> 'cancelado') as active_items,
      count(*) filter (where status = 'entregue') as delivered_items,
      count(*) filter (where status in ('aguardando_retirada', 'entregue')) as pickup_or_later_items,
      count(*) filter (where status in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue')) as ready_or_later_items,
      count(*) filter (where status in ('em_producao', 'finalizado', 'pronto', 'aguardando_retirada', 'entregue')) as production_or_later_items,
      count(*) filter (where status in ('arte_aprovada', 'em_producao', 'finalizado', 'pronto', 'aguardando_retirada', 'entregue')) as approved_or_later_items,
      count(*) filter (where status in ('produzindo_arte', 'arte_aprovada', 'em_producao', 'finalizado', 'pronto', 'aguardando_retirada', 'entregue')) as art_or_later_items,
      count(*) filter (where status in ('pendente', 'produzindo_arte', 'arte_aprovada', 'em_producao', 'finalizado', 'pronto', 'aguardando_retirada', 'entregue')) as pending_or_later_items
    from scoped_items
  )
  select case
    when total_items = 0 then 'orcamento'::public.order_status
    when active_items = 0 then 'cancelado'::public.order_status
    when delivered_items = active_items then 'entregue'::public.order_status
    when pickup_or_later_items = active_items then 'aguardando_retirada'::public.order_status
    when ready_or_later_items = active_items then 'finalizado'::public.order_status
    when production_or_later_items > 0 then 'em_producao'::public.order_status
    when approved_or_later_items > 0 then 'arte_aprovada'::public.order_status
    when art_or_later_items > 0 then 'produzindo_arte'::public.order_status
    when pending_or_later_items > 0 then 'pendente'::public.order_status
    else 'orcamento'::public.order_status
  end
  from totals;
$$;

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
    status = public.compute_order_status_from_items(p_order_id),
    updated_at = now()
  where id = p_order_id
  returning *
    into v_order;

  return v_order;
end;
$$;

create or replace function public.update_order_item_status(
  p_order_id uuid,
  p_item_id uuid,
  p_status public.order_status,
  p_notes text default null,
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
  v_item public.order_items%rowtype;
  v_updated_item public.order_items%rowtype;
  v_updated_order public.orders%rowtype;
  v_now timestamptz := now();
  v_next_order_status public.order_status;
  v_transition_allowed boolean := false;
  v_item_from_label text;
  v_item_to_label text;
  v_history_note text;
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
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
    raise exception 'Sem permissao para alterar status do item';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_order.company_id is null or v_order.company_id <> v_actor_company_id then
    raise exception 'Sem permissao para este pedido';
  end if;

  select *
    into v_item
  from public.order_items
  where id = p_item_id
    and order_id = p_order_id
  for update;

  if not found then
    raise exception 'Item nao encontrado';
  end if;

  if v_item.status = p_status then
    raise exception 'O item ja esta neste status';
  end if;

  v_transition_allowed := case v_item.status
    when 'orcamento' then p_status in ('pendente', 'cancelado')
    when 'pendente' then p_status in ('produzindo_arte', 'em_producao', 'cancelado')
    when 'produzindo_arte' then p_status in ('arte_aprovada', 'cancelado')
    when 'arte_aprovada' then p_status in ('em_producao', 'cancelado')
    when 'em_producao' then p_status in ('cancelado')
    when 'finalizado' then p_status in ('aguardando_retirada', 'cancelado')
    when 'pronto' then p_status in ('aguardando_retirada', 'cancelado')
    when 'aguardando_retirada' then p_status in ('cancelado')
    when 'cancelado' then p_status = 'pendente'
    else false
  end;

  if not v_transition_allowed then
    raise exception 'Mudanca de status nao permitida para este item';
  end if;

  if v_item.status = 'cancelado' and p_status = 'pendente' and v_actor_role not in ('admin', 'atendente') then
    raise exception 'Apenas Admin ou Atendente podem reativar itens cancelados';
  end if;

  update public.order_items
  set
    status = p_status,
    ready_at = case
      when p_status in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue') then coalesce(ready_at, v_now)
      else ready_at
    end,
    ready_by = case
      when p_status in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue') then coalesce(ready_by, v_actor_id)
      else ready_by
    end,
    delivered_at = case
      when p_status = 'entregue' then coalesce(delivered_at, v_now)
      else delivered_at
    end,
    delivered_by = case
      when p_status = 'entregue' then coalesce(delivered_by, v_actor_id)
      else delivered_by
    end
  where id = p_item_id
  returning *
    into v_updated_item;

  v_next_order_status := public.compute_order_status_from_items(p_order_id);

  update public.orders
  set
    status = v_next_order_status,
    delivered_at = case
      when v_next_order_status = 'entregue' then coalesce(delivered_at, v_now)
      else delivered_at
    end,
    delivered_by = case
      when v_next_order_status = 'entregue' then coalesce(delivered_by, v_actor_id)
      else delivered_by
    end,
    updated_by = v_actor_id
  where id = p_order_id
  returning *
    into v_updated_order;

  v_item_from_label := case v_item.status
    when 'orcamento' then 'Orcamento'
    when 'pendente' then 'Pendente'
    when 'produzindo_arte' then 'Produzindo arte'
    when 'arte_aprovada' then 'Arte aprovada'
    when 'em_producao' then 'Em producao'
    when 'finalizado' then 'Finalizado'
    when 'pronto' then 'Finalizado'
    when 'aguardando_retirada' then 'Aguardando retirada'
    when 'entregue' then 'Entregue'
    when 'cancelado' then 'Cancelado'
    else v_item.status::text
  end;

  v_item_to_label := case p_status
    when 'orcamento' then 'Orcamento'
    when 'pendente' then 'Pendente'
    when 'produzindo_arte' then 'Produzindo arte'
    when 'arte_aprovada' then 'Arte aprovada'
    when 'em_producao' then 'Em producao'
    when 'finalizado' then 'Finalizado'
    when 'pronto' then 'Finalizado'
    when 'aguardando_retirada' then 'Aguardando retirada'
    when 'entregue' then 'Entregue'
    when 'cancelado' then 'Cancelado'
    else p_status::text
  end;

  v_history_note := format(
    'Item "%s" alterado de %s para %s.',
    coalesce(v_item.product_name, 'Item'),
    v_item_from_label,
    v_item_to_label
  );

  if coalesce(trim(p_notes), '') <> '' then
    v_history_note := v_history_note || ' ' || trim(p_notes);
  end if;

  insert into public.order_status_history (
    order_id,
    status,
    user_id,
    notes
  )
  values (
    p_order_id,
    v_next_order_status,
    v_actor_id,
    v_history_note
  );

  return jsonb_build_object(
    'order', to_jsonb(v_updated_order),
    'item', to_jsonb(v_updated_item)
  );
end;
$$;

grant execute on function public.update_order_item_status(uuid, uuid, public.order_status, text, uuid) to authenticated;

create or replace function public.mark_order_items_ready(
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
  v_status_changed boolean := false;
  v_next_order_status public.order_status;
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
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
    raise exception 'Sem permissao para marcar itens como prontos';
  end if;

  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um item para marcar como pronto';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_order.company_id is null or v_order.company_id <> v_actor_company_id then
    raise exception 'Sem permissao para este pedido';
  end if;

  if v_order.status not in ('em_producao', 'finalizado', 'pronto', 'aguardando_retirada') then
    raise exception 'O pedido precisa estar em producao para registrar itens prontos';
  end if;

  with updated_items as (
    update public.order_items
    set
      status = case
        when status = 'aguardando_retirada' then 'aguardando_retirada'::public.order_status
        when status = 'entregue' then 'entregue'::public.order_status
        else 'finalizado'::public.order_status
      end,
      ready_at = coalesce(ready_at, v_now),
      ready_by = coalesce(ready_by, v_actor_id)
    where order_id = p_order_id
      and id = any(p_item_ids)
      and status <> 'cancelado'
      and ready_at is null
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
    raise exception 'Os itens selecionados ja foram marcados como prontos';
  end if;

  select
    count(*) filter (where status <> 'cancelado'),
    count(*) filter (where status <> 'cancelado' and coalesce(ready_at, delivered_at) is null)
  into
    v_total_count,
    v_pending_count
  from public.order_items
  where order_id = p_order_id;

  if v_total_count = 0 then
    raise exception 'Pedido sem itens ativos';
  end if;

  v_next_order_status := public.compute_order_status_from_items(p_order_id);

  update public.orders
  set
    status = v_next_order_status,
    updated_by = v_actor_id
  where id = p_order_id
  returning *
    into v_result_order;

  v_status_changed := v_order.status is distinct from v_next_order_status;

  insert into public.order_status_history (
    order_id,
    status,
    user_id,
    notes
  )
  values (
    p_order_id,
    v_next_order_status,
    v_actor_id,
    case
      when v_pending_count = 0 and coalesce(v_updated_names, '') <> '' then
        format('Todos os itens do pedido estao prontos. Itens prontos agora: %s.', v_updated_names)
      when v_pending_count = 0 then
        'Todos os itens do pedido estao prontos.'
      when coalesce(v_updated_names, '') <> '' then
        format('Itens marcados como prontos: %s.', v_updated_names)
      else
        'Itens marcados como prontos.'
    end
  );

  if v_status_changed and v_next_order_status = 'finalizado' then
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
      'Status alterado para: Finalizado'
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_result_order),
    'updated_item_ids', to_jsonb(v_updated_ids),
    'ready_completed', (v_pending_count = 0),
    'status_updated', v_status_changed
  );
end;
$$;

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
  v_selected_pending_count integer := 0;
  v_selected_not_ready_count integer := 0;
  v_updated_ids uuid[] := '{}'::uuid[];
  v_updated_names text := null;
  v_next_order_status public.order_status;
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
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
    raise exception 'Sem permissao para registrar a entrega';
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
    raise exception 'Pedido nao encontrado';
  end if;

  if v_order.company_id is null or v_order.company_id <> v_actor_company_id then
    raise exception 'Sem permissao para este pedido';
  end if;

  if v_order.status not in ('em_producao', 'finalizado', 'pronto', 'aguardando_retirada', 'entregue') then
    raise exception 'O pedido precisa estar em producao ou pronto para registrar a entrega';
  end if;

  select
    count(*) filter (where delivered_at is null),
    count(*) filter (where delivered_at is null and coalesce(ready_at, delivered_at) is null)
  into
    v_selected_pending_count,
    v_selected_not_ready_count
  from public.order_items
  where order_id = p_order_id
    and id = any(p_item_ids)
    and status <> 'cancelado';

  if v_selected_pending_count = 0 then
    raise exception 'Os itens selecionados ja foram entregues';
  end if;

  if v_selected_not_ready_count > 0 then
    raise exception 'Marque os itens como prontos antes de registrar a entrega';
  end if;

  with updated_items as (
    update public.order_items
    set
      status = 'entregue',
      ready_at = coalesce(ready_at, v_now),
      ready_by = coalesce(ready_by, v_actor_id),
      delivered_at = coalesce(delivered_at, v_now),
      delivered_by = coalesce(delivered_by, v_actor_id)
    where order_id = p_order_id
      and id = any(p_item_ids)
      and status <> 'cancelado'
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
    raise exception 'Os itens selecionados ja foram entregues';
  end if;

  select
    count(*) filter (where status <> 'cancelado'),
    count(*) filter (where status <> 'cancelado' and delivered_at is null)
  into
    v_total_count,
    v_pending_count
  from public.order_items
  where order_id = p_order_id;

  if v_total_count = 0 then
    raise exception 'Pedido sem itens ativos';
  end if;

  v_next_order_status := public.compute_order_status_from_items(p_order_id);

  update public.orders
  set
    status = v_next_order_status,
    delivered_at = case
      when v_next_order_status = 'entregue' then coalesce(delivered_at, v_now)
      else delivered_at
    end,
    delivered_by = case
      when v_next_order_status = 'entregue' then coalesce(delivered_by, v_actor_id)
      else delivered_by
    end,
    updated_by = v_actor_id
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
    v_next_order_status,
    v_actor_id,
    case
      when v_pending_count = 0 and coalesce(v_updated_names, '') <> '' then
        format('Entrega concluida. Itens entregues: %s.', v_updated_names)
      when v_pending_count = 0 then
        'Entrega concluida.'
      when coalesce(v_updated_names, '') <> '' then
        format('Entrega parcial registrada. Itens entregues: %s.', v_updated_names)
      else
        'Entrega parcial registrada.'
    end
  );

  if v_next_order_status = 'entregue' and v_order.status is distinct from 'entregue' then
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

  return jsonb_build_object(
    'order', to_jsonb(v_result_order),
    'updated_item_ids', to_jsonb(v_updated_ids),
    'delivery_completed', (v_pending_count = 0)
  );
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
        'status', oi.status,
        'ready_at', oi.ready_at,
        'ready_by', oi.ready_by,
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
