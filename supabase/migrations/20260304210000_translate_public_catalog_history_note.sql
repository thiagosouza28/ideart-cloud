-- Normalize legacy English status-history note from public catalog orders.

create or replace function public.normalize_public_catalog_order_history_note()
returns trigger
language plpgsql
as $$
begin
  if new.notes is not null and lower(trim(new.notes)) = 'order created via public catalog' then
    new.notes := 'Pedido criado via catalogo publico';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_public_catalog_order_history_note on public.order_status_history;

create trigger trg_normalize_public_catalog_order_history_note
before insert or update of notes on public.order_status_history
for each row
execute function public.normalize_public_catalog_order_history_note();

update public.order_status_history
set notes = 'Pedido criado via catalogo publico'
where lower(trim(notes)) = 'order created via public catalog';
