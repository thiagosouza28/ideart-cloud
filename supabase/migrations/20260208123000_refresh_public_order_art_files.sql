-- Refresh public order payload to include art files for review.

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
      'gateway', to_jsonb(o) -> 'gateway',
      'gateway_order_id', to_jsonb(o) -> 'gateway_order_id',
      'payment_link_id', to_jsonb(o) -> 'payment_link_id',
      'payment_link_url', to_jsonb(o) -> 'payment_link_url',
      'notes', o.notes,
      'created_at', o.created_at,
      'approved_at', o.approved_at
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
        'created_at', oi.created_at
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
