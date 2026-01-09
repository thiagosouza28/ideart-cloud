create or replace function public.approve_art_by_token(p_token text)
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
  v_has_files boolean;
begin
  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    raise exception 'Invalid token';
  end if;

  select company_id, order_number, status
    into v_company_id, v_order_number, v_current_status
  from public.orders
  where id = v_order_id;

  if v_current_status <> 'produzindo_arte' then
    return public.get_public_order(p_token);
  end if;

  select exists(
    select 1
    from public.order_art_files
    where order_id = v_order_id
  )
  into v_has_files;

  if not v_has_files then
    raise exception 'Nenhum arquivo de arte anexado';
  end if;

  update public.orders
  set status = 'arte_aprovada',
      updated_at = now()
  where id = v_order_id;

  insert into public.order_status_history (order_id, status, notes, user_id)
  values (v_order_id, 'arte_aprovada', 'Arte aprovada pelo cliente', null);

  insert into public.order_notifications (company_id, order_id, type, title, body)
  values (
    v_company_id,
    v_order_id,
    'art_approval',
    'Arte aprovada',
    format('Arte aprovada pelo cliente no pedido #%s.', v_order_number)
  );

  return public.get_public_order(p_token);
end $$;
