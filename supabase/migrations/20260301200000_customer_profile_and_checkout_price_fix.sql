-- Customer profile update RPC and checkout pricing alignment with catalog.

create or replace function public.upsert_catalog_customer_checkout_profile(
  p_company_id uuid,
  p_name text default null,
  p_phone text default null,
  p_document text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_document text := nullif(trim(coalesce(p_document, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_state text := nullif(trim(coalesce(p_state, '')), '');
  v_zip_code text := nullif(trim(coalesce(p_zip_code, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    raise exception 'Company not found';
  end if;

  select c.id
    into v_customer_id
  from public.customers c
  where c.company_id = p_company_id
    and c.user_id = v_user_id
  order by c.updated_at desc nulls last
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      company_id,
      user_id,
      name,
      phone,
      document,
      email,
      address,
      city,
      state,
      zip_code
    )
    values (
      p_company_id,
      v_user_id,
      coalesce(v_name, 'Cliente'),
      v_phone,
      v_document,
      v_email,
      v_address,
      v_city,
      v_state,
      v_zip_code
    )
    returning id into v_customer_id;
  else
    update public.customers
    set name = coalesce(v_name, name),
        phone = coalesce(v_phone, phone),
        document = coalesce(v_document, document),
        email = coalesce(v_email, email),
        address = coalesce(v_address, address),
        city = coalesce(v_city, city),
        state = coalesce(v_state, state),
        zip_code = coalesce(v_zip_code, zip_code),
        updated_at = now()
    where id = v_customer_id;
  end if;

  return v_customer_id;
end $$;

grant execute on function public.upsert_catalog_customer_checkout_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.create_public_order(
  p_company_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_document text,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_customer_email text default null,
  p_customer_address text default null,
  p_customer_city text default null,
  p_customer_state text default null,
  p_customer_zip_code text default null
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
  v_existing_customer_id uuid;
  v_customer_user_id uuid := auth.uid();
  v_min_order numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_token text;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(10,2);
  v_item_notes text;
  v_product record;
  v_unit_price numeric(10,2);
  v_customer_email text := nullif(trim(coalesce(p_customer_email, '')), '');
  v_customer_address text := nullif(trim(coalesce(p_customer_address, '')), '');
  v_customer_city text := nullif(trim(coalesce(p_customer_city, '')), '');
  v_customer_state text := nullif(trim(coalesce(p_customer_state, '')), '');
  v_customer_zip_code text := nullif(trim(coalesce(p_customer_zip_code, '')), '');
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

  if v_customer_user_id is not null then
    select c.id
      into v_existing_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and c.user_id = v_customer_user_id
    order by c.updated_at desc nulls last
    limit 1;
  end if;

  if v_existing_customer_id is not null then
    update public.customers
    set name = trim(p_customer_name),
        phone = trim(p_customer_phone),
        document = trim(p_customer_document),
        email = v_customer_email,
        address = v_customer_address,
        city = v_customer_city,
        state = v_customer_state,
        zip_code = v_customer_zip_code,
        user_id = v_customer_user_id,
        updated_at = now()
    where id = v_existing_customer_id
    returning id into v_customer_id;
  else
    insert into public.customers (
      name,
      phone,
      document,
      email,
      address,
      city,
      state,
      zip_code,
      user_id,
      company_id
    ) values (
      trim(p_customer_name),
      trim(p_customer_phone),
      trim(p_customer_document),
      v_customer_email,
      v_customer_address,
      v_customer_city,
      v_customer_state,
      v_customer_zip_code,
      v_customer_user_id,
      p_company_id
    )
    returning id into v_customer_id;
  end if;

  insert into public.orders (
    company_id,
    customer_id,
    customer_user_id,
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
    v_customer_user_id,
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
    v_item_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    if v_product_id is null or v_quantity <= 0 then
      raise exception 'Invalid item';
    end if;

    select
      id,
      name,
      final_price,
      catalog_price,
      promo_price,
      promo_start_at,
      promo_end_at,
      min_order_quantity,
      base_cost,
      labor_cost,
      waste_percentage,
      profit_margin
      into v_product
    from public.products
    where id = v_product_id
      and company_id = p_company_id
      and (show_in_catalog = true or coalesce(catalog_enabled, false) = true)
      and is_active = true;

    if not found then
      raise exception 'Invalid product';
    end if;

    if v_quantity < coalesce(v_product.min_order_quantity, 1) then
      raise exception 'Minimum quantity not reached';
    end if;

    if v_product.promo_price is not null
      and (v_product.promo_start_at is null or now() >= v_product.promo_start_at)
      and (v_product.promo_end_at is null or now() <= v_product.promo_end_at) then
      v_unit_price := v_product.promo_price;
    elsif v_product.catalog_price is not null then
      v_unit_price := v_product.catalog_price;
    elsif v_product.final_price is not null then
      v_unit_price := v_product.final_price;
    else
      v_unit_price := (
        (
          coalesce(v_product.base_cost, 0)
          + coalesce(v_product.labor_cost, 0)
        )
        * (1 + coalesce(v_product.waste_percentage, 0) / 100)
        * (1 + coalesce(v_product.profit_margin, 0) / 100)
      );
    end if;

    v_unit_price := round(coalesce(v_unit_price, 0)::numeric, 2);
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

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
      v_unit_price,
      0,
      v_unit_price * v_quantity,
      null,
      v_item_notes
    );
  end loop;

  v_total := v_subtotal - v_discount;

  if v_min_order > 0 and v_total < v_min_order then
    raise exception 'Minimum order value not reached';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_total
  where id = v_order_id;

  insert into public.order_status_history (order_id, status, notes, user_id)
  values (v_order_id, 'pendente', 'Order created via public catalog', null);

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
  jsonb,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;
