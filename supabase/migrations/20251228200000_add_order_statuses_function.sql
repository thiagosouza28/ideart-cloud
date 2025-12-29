create or replace function public.get_order_statuses()
  returns text[]
  language sql
  security definer
  set search_path = 'public'
as $$
  select enum_range(null::public.order_status)::text[];
$$;

grant execute on function public.get_order_statuses() to authenticated;
