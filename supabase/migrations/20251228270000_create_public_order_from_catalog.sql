-- Create public order RPC for catalog checkout (pre-order).

create or replace function public.create_public_order(
  p_company_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_document text,
  p_payment_method public.payment_method,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_order_number integer;
  v_customer_id uuid;
  v_min_order numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_token text;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(10,2);
  v_product record;
begin
  if p_company_id is null then
    raise exception 'Company is required';
  end if;

  select coalesce(c.minimum_order_value, 0)
    into v_min_order
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    raise exception 'Company not found';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) = 0 then
    raise exception 'Customer phone is required';
  end if;

  if p_customer_document is null or length(trim(p_customer_document)) = 0 then
    raise exception 'Customer document is required';
  end if;

  if p_payment_method is null then
    raise exception 'Payment method is required';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Items are required';
  end if;

  insert into public.customers (name, phone, document)
  values (trim(p_customer_name), trim(p_customer_phone), trim(p_customer_document))
  returning id into v_customer_id;

  insert into public.orders (
    company_id,
    customer_id,
    customer_name,
    status,
    subtotal,
    discount,
    total,
    payment_method,
    payment_status,
    amount_paid,
    created_by
  ) values (
    p_company_id,
    v_customer_id,
    trim(p_customer_name),
    'pendente',
    0,
    0,
    0,
    p_payment_method,
    'pendente',
    0,
    null
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);

    if v_product_id is null or v_quantity <= 0 then
      raise exception 'Invalid item';
    end if;

    select id, name, final_price
      into v_product
    from public.products
    where id = v_product_id
      and company_id = p_company_id
      and show_in_catalog = true
      and is_active = true;

    if not found then
      raise exception 'Invalid product';
    end if;

    v_subtotal := v_subtotal + (coalesce(v_product.final_price, 0) * v_quantity);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      discount,
      total,
      attributes,
      notes
    ) values (
      v_order_id,
      v_product_id,
      v_product.name,
      v_quantity,
      coalesce(v_product.final_price, 0),
      0,
      coalesce(v_product.final_price, 0) * v_quantity,
      null,
      null
    );
  end loop;

  v_total := v_subtotal - v_discount;

  if v_min_order > 0 and v_total < v_min_order then
    raise exception 'Valor mínimo do pedido não atingido';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_total
  where id = v_order_id;

  insert into public.order_status_history (order_id, status, notes, user_id)
  values (v_order_id, 'pendente', 'Pedido criado via catálogo público', null);

  insert into public.order_public_links (order_id)
  values (v_order_id)
  on conflict (order_id) do update
  set order_id = excluded.order_id
  returning token into v_token;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'public_token', v_token
  );
end $$;

grant execute on function public.create_public_order(
  uuid,
  text,
  text,
  text,
  public.payment_method,
  jsonb
) to anon, authenticated;
