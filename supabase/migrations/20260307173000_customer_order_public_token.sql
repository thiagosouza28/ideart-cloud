create or replace function public.get_customer_order_public_token(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_customer_user_id uuid := auth.uid();
  v_token text;
begin
  if v_customer_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = p_order_id
      and customer_user_id = v_customer_user_id
  ) then
    raise exception 'Pedido não encontrado';
  end if;

  insert into public.order_public_links (order_id)
  values (p_order_id)
  on conflict (order_id) do update
  set order_id = excluded.order_id
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.get_customer_order_public_token(uuid) from public;
grant execute on function public.get_customer_order_public_token(uuid) to authenticated;
