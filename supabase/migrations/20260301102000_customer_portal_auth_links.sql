-- Link public orders and reviews to authenticated end customers.

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_user_id_idx
  on public.orders(customer_user_id);

alter table public.product_reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists product_reviews_user_id_idx
  on public.product_reviews(user_id);

drop policy if exists "Orders customer own read" on public.orders;
create policy "Orders customer own read"
  on public.orders
  for select
  to authenticated
  using (customer_user_id = auth.uid());

drop policy if exists "Order items customer own read" on public.order_items;
create policy "Order items customer own read"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.customer_user_id = auth.uid()
    )
  );

drop policy if exists "Order status history customer own read" on public.order_status_history;
create policy "Order status history customer own read"
  on public.order_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_status_history.order_id
        and o.customer_user_id = auth.uid()
    )
  );

drop policy if exists "Product reviews public insert" on public.product_reviews;
create policy "Product reviews public insert"
  on public.product_reviews
  for insert
  to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and rating between 1 and 5
    and length(trim(coalesce(reviewer_name, ''))) between 2 and 120
    and exists (
      select 1
      from public.products p
      join public.companies c on c.id = p.company_id
      where p.id = product_reviews.product_id
        and p.company_id = product_reviews.company_id
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or p.show_in_catalog = true)
        and c.is_active = true
    )
  );

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

  insert into public.customers (name, phone, document, company_id)
  values (trim(p_customer_name), trim(p_customer_phone), trim(p_customer_document), p_company_id)
  returning id into v_customer_id;

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

    select id, name, final_price, min_order_quantity
      into v_product
    from public.products
    where id = v_product_id
      and company_id = p_company_id
      and show_in_catalog = true
      and is_active = true;

    if not found then
      raise exception 'Invalid product';
    end if;

    if v_quantity < coalesce(v_product.min_order_quantity, 1) then
      raise exception 'Minimum quantity not reached';
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
  jsonb
) to anon, authenticated;
