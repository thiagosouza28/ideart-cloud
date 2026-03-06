-- Notify store users when a new order is created from the public catalog.

create or replace function public.notify_new_public_catalog_order()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_order_number integer;
  v_customer_name text;
  v_note text := lower(trim(coalesce(new.notes, '')));
begin
  if new.order_id is null then
    return new;
  end if;

  if v_note not in ('pedido criado via catalogo publico', 'order created via public catalog') then
    return new;
  end if;

  select
    o.company_id,
    o.order_number,
    coalesce(nullif(trim(o.customer_name), ''), 'Cliente')
  into
    v_company_id,
    v_order_number,
    v_customer_name
  from public.orders o
  where o.id = new.order_id;

  if v_company_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.order_notifications n
    where n.order_id = new.order_id
      and n.type = 'new_order'
  ) then
    return new;
  end if;

  insert into public.order_notifications (
    company_id,
    order_id,
    type,
    title,
    body
  ) values (
    v_company_id,
    new.order_id,
    'new_order',
    format('Novo pedido - #%s', coalesce(v_order_number::text, '---')),
    format('Pedido recebido pelo catalogo. Cliente: %s', v_customer_name)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_public_catalog_order on public.order_status_history;

create trigger trg_notify_new_public_catalog_order
after insert on public.order_status_history
for each row
execute function public.notify_new_public_catalog_order();

