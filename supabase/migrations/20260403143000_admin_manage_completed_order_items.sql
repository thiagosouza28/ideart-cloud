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
  v_actor_is_admin boolean := false;
  v_actor_is_super_admin boolean := false;
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

  v_actor_is_admin := public.has_role(v_actor_id, 'admin'::public.app_role);
  v_actor_is_super_admin := public.has_role(v_actor_id, 'super_admin'::public.app_role);

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

  if not v_actor_is_super_admin and (v_actor_company_id is null or v_actor_role is null) then
    raise exception 'Sem permissao para alterar status do item';
  end if;

  if v_actor_role is null and v_actor_is_super_admin then
    v_actor_role := 'super_admin';
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

  if not v_actor_is_super_admin and (v_order.company_id is null or v_order.company_id <> v_actor_company_id) then
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

  if (
    p_status = 'cancelado'
    and (
      v_order.status in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue')
      or v_item.status in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue')
    )
    and not v_actor_is_admin
    and not v_actor_is_super_admin
  ) then
    raise exception 'Apenas o administrador da loja pode cancelar item apos a finalizacao';
  end if;

  if (
    v_item.status = 'cancelado'
    and p_status = 'pendente'
    and v_actor_role not in ('admin', 'atendente')
    and not v_actor_is_super_admin
  ) then
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

drop function if exists public.delete_order_item_admin(uuid, uuid, text, uuid);

create or replace function public.delete_order_item_admin(
  p_order_id uuid,
  p_item_id uuid,
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
  v_actor_is_admin boolean := false;
  v_actor_is_super_admin boolean := false;
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_updated_order public.orders%rowtype;
  v_now timestamptz := now();
  v_discount_type text := 'fixed';
  v_discount_value numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_freight_amount numeric(10,2) := 0;
  v_new_subtotal numeric(10,2) := 0;
  v_new_total numeric(10,2) := 0;
  v_settled_total numeric(10,2) := 0;
  v_payment_status public.payment_status := 'pendente';
  v_next_order_status public.order_status;
  v_history_note text;
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  v_actor_is_admin := public.has_role(v_actor_id, 'admin'::public.app_role);
  v_actor_is_super_admin := public.has_role(v_actor_id, 'super_admin'::public.app_role);

  if not v_actor_is_admin and not v_actor_is_super_admin then
    raise exception 'Apenas o administrador da loja pode excluir itens apos a finalizacao';
  end if;

  select p.company_id
    into v_actor_company_id
  from public.profiles p
  where p.id = v_actor_id;

  select *
    into v_order
  from public.orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  if not v_actor_is_super_admin and (v_order.company_id is null or v_order.company_id <> v_actor_company_id) then
    raise exception 'Sem permissao para este pedido';
  end if;

  if v_order.status not in ('finalizado', 'pronto', 'aguardando_retirada', 'entregue') then
    raise exception 'A exclusao administrativa de item so esta disponivel apos a finalizacao do pedido';
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

  select settled_total
    into v_settled_total
  from public.get_order_payment_summary_data(p_order_id);

  v_discount_type := coalesce(nullif(trim(v_order.discount_type), ''), 'fixed');
  v_discount_value := greatest(0, coalesce(v_order.discount_value, 0));
  v_freight_amount := greatest(0, coalesce(v_order.freight_amount, 0));
  v_new_subtotal := greatest(0, round(coalesce(v_order.subtotal, 0) - coalesce(v_item.total, 0), 2));

  v_discount_amount :=
    case
      when v_discount_type = 'percent' then
        round(v_new_subtotal * least(v_discount_value, 100) / 100, 2)
      else
        least(v_new_subtotal, v_discount_value)
    end;

  v_new_total := greatest(0, round(v_new_subtotal - v_discount_amount + v_freight_amount, 2));

  if coalesce(v_settled_total, 0) > v_new_total then
    raise exception 'Nao e possivel excluir o item porque o total do pedido ficaria abaixo do valor ja quitado';
  end if;

  delete from public.order_items
  where id = p_item_id
    and order_id = p_order_id;

  v_next_order_status := public.compute_order_status_from_items(p_order_id);
  v_payment_status :=
    case
      when coalesce(v_settled_total, 0) >= v_new_total and v_new_total > 0 then 'pago'::public.payment_status
      when coalesce(v_settled_total, 0) > 0 then 'parcial'::public.payment_status
      else 'pendente'::public.payment_status
    end;

  update public.orders
  set
    subtotal = v_new_subtotal,
    discount = v_discount_amount,
    total = v_new_total,
    payment_status = v_payment_status,
    status = v_next_order_status,
    delivered_at = case
      when v_next_order_status = 'entregue' then coalesce(delivered_at, v_now)
      else delivered_at
    end,
    delivered_by = case
      when v_next_order_status = 'entregue' then coalesce(delivered_by, v_actor_id)
      else delivered_by
    end,
    updated_at = v_now,
    updated_by = v_actor_id
  where id = p_order_id
  returning *
    into v_updated_order;

  v_history_note := format(
    'Item "%s" excluido do pedido apos a finalizacao.',
    coalesce(v_item.product_name, 'Item')
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
    'deletedItemId', p_item_id
  );
end;
$$;

grant execute on function public.delete_order_item_admin(uuid, uuid, text, uuid) to authenticated;
