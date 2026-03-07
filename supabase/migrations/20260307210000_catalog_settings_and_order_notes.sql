create table if not exists public.catalog_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.companies(id) on delete cascade,
  catalog_title text not null default 'Catálogo da loja',
  catalog_description text not null default '',
  primary_color text not null default '#2563eb',
  secondary_color text not null default '#1d4ed8',
  text_color text not null default '#1a1814',
  button_text text not null default 'Comprar agora',
  contact_link text,
  show_prices boolean not null default true,
  show_contact boolean not null default true,
  catalog_layout character varying(10) not null default 'grid',
  accepted_payment_methods public.payment_method[] not null default array[
    'pix'::public.payment_method,
    'dinheiro'::public.payment_method,
    'credito'::public.payment_method,
    'debito'::public.payment_method,
    'transferencia'::public.payment_method,
    'outro'::public.payment_method
  ],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_settings_layout_check check (catalog_layout in ('grid', 'list')),
  constraint catalog_settings_payment_methods_check check (
    cardinality(accepted_payment_methods) > 0
    and accepted_payment_methods <@ array[
      'pix'::public.payment_method,
      'dinheiro'::public.payment_method,
      'credito'::public.payment_method,
      'debito'::public.payment_method,
      'transferencia'::public.payment_method,
      'outro'::public.payment_method
    ]
  )
);

alter table public.catalog_settings enable row level security;

drop trigger if exists update_catalog_settings_updated_at on public.catalog_settings;
create trigger update_catalog_settings_updated_at
before update on public.catalog_settings
for each row execute function public.update_updated_at();

create or replace function public.ensure_company_catalog_settings()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.catalog_settings (store_id)
  values (new.id)
  on conflict (store_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_company_catalog_settings_on_companies on public.companies;
create trigger ensure_company_catalog_settings_on_companies
after insert on public.companies
for each row execute function public.ensure_company_catalog_settings();

insert into public.catalog_settings (
  store_id,
  catalog_title,
  catalog_description,
  primary_color,
  secondary_color,
  text_color,
  button_text,
  contact_link,
  show_prices,
  show_contact,
  catalog_layout
)
select
  c.id,
  coalesce(nullif(trim(c.catalog_title), ''), 'Catálogo da loja'),
  coalesce(c.catalog_description, ''),
  coalesce(
    nullif(trim(c.catalog_button_bg_color), ''),
    nullif(trim(c.catalog_primary_color), ''),
    '#2563eb'
  ),
  coalesce(
    nullif(trim(c.catalog_header_bg_color), ''),
    nullif(trim(c.catalog_secondary_color), ''),
    '#1d4ed8'
  ),
  coalesce(nullif(trim(c.catalog_text_color), ''), '#1a1814'),
  coalesce(nullif(trim(c.catalog_button_text), ''), 'Comprar agora'),
  nullif(trim(c.catalog_contact_url), ''),
  coalesce(c.catalog_show_prices, true),
  coalesce(c.catalog_show_contact, true),
  case when c.catalog_layout = 'list' then 'list' else 'grid' end
from public.companies c
on conflict (store_id) do update
set
  catalog_title = excluded.catalog_title,
  catalog_description = excluded.catalog_description,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  text_color = excluded.text_color,
  button_text = excluded.button_text,
  contact_link = excluded.contact_link,
  show_prices = excluded.show_prices,
  show_contact = excluded.show_contact,
  catalog_layout = excluded.catalog_layout;

drop policy if exists "Public can view active catalog settings" on public.catalog_settings;
create policy "Public can view active catalog settings"
on public.catalog_settings
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = catalog_settings.store_id
      and c.is_active = true
  )
);

drop policy if exists "Company admins can manage own catalog settings" on public.catalog_settings;
create policy "Company admins can manage own catalog settings"
on public.catalog_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = catalog_settings.store_id
      and ur.role = 'admin'::public.app_role
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = catalog_settings.store_id
      and ur.role = 'admin'::public.app_role
  )
);

grant select on public.catalog_settings to anon;
grant select, insert, update on public.catalog_settings to authenticated;

alter table public.orders
  add column if not exists show_notes_on_pdf boolean not null default true;

create or replace function public.get_company_checkout_payment_options(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company_exists boolean := false;
  v_has_access boolean := false;
  v_pix_available boolean := false;
  v_pix_gateway text := null;
  v_payment_methods public.payment_method[] := array[
    'pix'::public.payment_method,
    'dinheiro'::public.payment_method,
    'credito'::public.payment_method,
    'debito'::public.payment_method,
    'transferencia'::public.payment_method,
    'outro'::public.payment_method
  ];
begin
  select
    true,
    c.pix_gateway,
    coalesce(
      cs.accepted_payment_methods,
      array[
        'pix'::public.payment_method,
        'dinheiro'::public.payment_method,
        'credito'::public.payment_method,
        'debito'::public.payment_method,
        'transferencia'::public.payment_method,
        'outro'::public.payment_method
      ]
    )
  into
    v_company_exists,
    v_pix_gateway,
    v_payment_methods
  from public.companies c
  left join public.catalog_settings cs on cs.store_id = c.id
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    return jsonb_build_object(
      'company_exists', false,
      'has_access', false,
      'pix_available', false,
      'pix_gateway', null,
      'payment_methods', '[]'::jsonb
    );
  end if;

  v_has_access := public.company_has_active_access(p_company_id);
  v_pix_available := v_has_access and public.company_pix_is_ready(p_company_id);

  if not v_has_access then
    v_payment_methods := array[]::public.payment_method[];
  elsif not v_pix_available then
    v_payment_methods := array_remove(v_payment_methods, 'pix'::public.payment_method);
  end if;

  return jsonb_build_object(
    'company_exists', v_company_exists,
    'has_access', v_has_access,
    'pix_available', v_pix_available,
    'pix_gateway', case when v_pix_available then v_pix_gateway else null end,
    'payment_methods', to_jsonb(v_payment_methods)
  );
end;
$$;

drop function if exists public.create_public_order(
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
);

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
  p_customer_zip_code text default null,
  p_order_notes text default null
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
  v_customer_document_digits text := regexp_replace(trim(coalesce(p_customer_document, '')), '\D', '', 'g');
  v_pix_gateway text;
  v_company_delivery_days integer := 0;
  v_item_is_personalized boolean := false;
  v_item_is_custom boolean := false;
  v_has_personalized_item boolean := false;
  v_reference_file_path text;
  v_reference_file_name text;
  v_reference_file_type text;
  v_item_production_days integer;
  v_max_production_days integer := null;
  v_estimated_delivery_date date := null;
  v_order_notes text;
  v_visible_order_notes text := nullif(trim(coalesce(p_order_notes, '')), '');
  v_allowed_payment_methods public.payment_method[] := array[
    'pix'::public.payment_method,
    'dinheiro'::public.payment_method,
    'credito'::public.payment_method,
    'debito'::public.payment_method,
    'transferencia'::public.payment_method,
    'outro'::public.payment_method
  ];
begin
  if p_company_id is null then
    raise exception 'Company is required';
  end if;

  select
    coalesce(c.minimum_order_value, 0),
    c.pix_gateway,
    coalesce(
      case
        when coalesce(to_jsonb(c) ->> 'prazo_entrega_loja_dias', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'prazo_entrega_loja_dias')::numeric)::integer
      end,
      case
        when coalesce(to_jsonb(c) ->> 'delivery_time_days', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'delivery_time_days')::numeric)::integer
      end,
      0
    ),
    coalesce(
      cs.accepted_payment_methods,
      array[
        'pix'::public.payment_method,
        'dinheiro'::public.payment_method,
        'credito'::public.payment_method,
        'debito'::public.payment_method,
        'transferencia'::public.payment_method,
        'outro'::public.payment_method
      ]
    )
  into
    v_min_order,
    v_pix_gateway,
    v_company_delivery_days,
    v_allowed_payment_methods
  from public.companies c
  left join public.catalog_settings cs on cs.store_id = c.id
  where c.id = p_company_id
    and c.is_active = true;

  if not found then
    raise exception 'Company not found';
  end if;

  if not public.company_has_active_access(p_company_id) then
    raise exception 'Company access blocked';
  end if;

  perform public.assert_company_order_limit(p_company_id);

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) = 0 then
    raise exception 'Customer phone is required';
  end if;

  if p_customer_document is null or length(trim(p_customer_document)) = 0 then
    raise exception 'Customer document is required';
  end if;

  if v_customer_document_digits = '' then
    raise exception 'Customer document is required';
  end if;

  if p_payment_method is null then
    raise exception 'Payment method is required';
  end if;

  if not (p_payment_method = any(v_allowed_payment_methods)) then
    raise exception 'Payment method not allowed for this company';
  end if;

  if p_payment_method = 'pix'::public.payment_method and not public.company_pix_is_ready(p_company_id) then
    raise exception 'PIX unavailable for this company';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Items are required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || v_customer_document_digits));

  select c.id
    into v_existing_customer_id
  from public.customers c
  where c.company_id = p_company_id
    and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_customer_document_digits
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if v_existing_customer_id is null and v_customer_user_id is not null then
    select c.id
      into v_existing_customer_id
    from public.customers c
    where c.company_id = p_company_id
      and c.user_id = v_customer_user_id
    order by c.updated_at desc nulls last, c.created_at desc nulls last
    limit 1;
  end if;

  if v_existing_customer_id is not null then
    update public.customers
    set name = trim(p_customer_name),
        phone = trim(p_customer_phone),
        document = v_customer_document_digits,
        email = v_customer_email,
        address = v_customer_address,
        city = v_customer_city,
        state = v_customer_state,
        zip_code = v_customer_zip_code,
        user_id = coalesce(v_customer_user_id, user_id),
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
      v_customer_document_digits,
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
    created_by,
    gateway,
    payment_id,
    payment_qr_code,
    payment_copy_paste,
    paid_at,
    notes,
    production_time_days_used,
    estimated_delivery_date
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
    null,
    case when p_payment_method = 'pix'::public.payment_method then v_pix_gateway else null end,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_item_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');
    v_reference_file_path := nullif(trim(coalesce(v_item->>'reference_file_path', '')), '');
    v_reference_file_name := nullif(trim(coalesce(v_item->>'reference_file_name', '')), '');
    v_reference_file_type := nullif(trim(coalesce(v_item->>'reference_file_type', '')), '');

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
      profit_margin,
      personalization_enabled,
      product_type,
      production_time_days
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

    v_item_is_personalized := coalesce(v_product.personalization_enabled, false);
    if v_item_is_personalized then
      v_has_personalized_item := true;

      if v_reference_file_path is not null then
        if position(format('public-catalog/%s/', p_company_id::text) in v_reference_file_path) <> 1 then
          raise exception 'Invalid reference file path';
        end if;

        if coalesce(v_reference_file_type, '') not in (
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf'
        ) then
          raise exception 'Invalid reference file type';
        end if;

        if v_reference_file_name is null then
          v_reference_file_name := regexp_replace(v_reference_file_path, '^.*/', '');
        end if;

        insert into public.order_art_files (
          order_id,
          storage_path,
          file_name,
          file_type,
          created_by
        )
        select
          v_order_id,
          v_reference_file_path,
          coalesce(v_reference_file_name, 'referencia'),
          v_reference_file_type,
          v_customer_user_id
        where not exists (
          select 1
          from public.order_art_files af
          where af.order_id = v_order_id
            and af.storage_path = v_reference_file_path
        );
      end if;
    end if;

    v_item_is_custom :=
      v_item_is_personalized
      or v_product.product_type = 'confeccionado'::public.product_type;
    if v_item_is_custom then
      v_item_production_days := greatest(coalesce(v_product.production_time_days, 0), 0);
      if v_max_production_days is null or v_item_production_days > v_max_production_days then
        v_max_production_days := v_item_production_days;
      end if;
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

  if v_max_production_days is not null then
    v_estimated_delivery_date :=
      current_date + (v_max_production_days + greatest(v_company_delivery_days, 0));
  end if;

  v_order_notes := '[meta] source=public_catalog' || E'\n[meta] pending_customer_info=true';
  if v_has_personalized_item then
    v_order_notes := v_order_notes || E'\n[meta] public_catalog_personalized=true';
  end if;
  v_order_notes := v_order_notes || E'\nPendente - aguardando informacoes do cliente.';

  if v_visible_order_notes is not null then
    v_order_notes := v_order_notes || E'\n' || v_visible_order_notes;
  end if;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_total,
      notes = v_order_notes,
      production_time_days_used = v_max_production_days,
      estimated_delivery_date = v_estimated_delivery_date
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
    'public_token', v_token,
    'production_time_days_used', v_max_production_days,
    'estimated_delivery_date', v_estimated_delivery_date
  );
end;
$$;

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
  text,
  text
) to anon, authenticated;

