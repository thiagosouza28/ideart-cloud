-- Migrate legacy "pronto" status to "finalizado" after enum values are committed.

update public.order_status_history
set status = 'finalizado'
where status = 'pronto';

update public.orders
set status = 'finalizado'
where status = 'pronto';
