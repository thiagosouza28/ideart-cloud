create or replace function public.add_business_days(
  p_start_date date,
  p_business_days integer
)
returns date
language plpgsql
stable
as $$
declare
  v_date date := coalesce(p_start_date, current_date);
  v_remaining integer := greatest(coalesce(p_business_days, 0), 0);
begin
  while extract(isodow from v_date) in (6, 7) loop
    v_date := v_date + 1;
  end loop;

  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) between 1 and 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;

  return v_date;
end;
$$;

alter function public.create_public_order(
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
) rename to create_public_order_legacy;

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
  v_result jsonb;
  v_order_id uuid;
  v_production_time_days integer;
  v_company_delivery_days integer := 0;
  v_estimated_delivery_date date := null;
begin
  v_result := public.create_public_order_legacy(
    p_company_id,
    p_customer_name,
    p_customer_phone,
    p_customer_document,
    p_payment_method,
    p_items,
    p_customer_email,
    p_customer_address,
    p_customer_city,
    p_customer_state,
    p_customer_zip_code,
    p_order_notes
  );

  v_order_id := nullif(v_result->>'order_id', '')::uuid;
  v_production_time_days := nullif(v_result->>'production_time_days_used', '')::integer;

  if v_order_id is null then
    return v_result;
  end if;

  select
    coalesce(
      case
        when coalesce(to_jsonb(c) ->> 'prazo_entrega_loja_dias', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'prazo_entrega_loja_dias')::numeric)::integer
        when coalesce(to_jsonb(c) ->> 'delivery_time_days', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'delivery_time_days')::numeric)::integer
        when coalesce(to_jsonb(c) ->> 'delivery_days', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'delivery_days')::numeric)::integer
        when coalesce(to_jsonb(c) ->> 'prazo_entrega_dias', '') ~ '^\d+(\.\d+)?$'
          then ((to_jsonb(c) ->> 'prazo_entrega_dias')::numeric)::integer
        else 0
      end,
      0
    )
  into v_company_delivery_days
  from public.companies c
  where c.id = p_company_id;

  if v_production_time_days is not null then
    v_estimated_delivery_date := public.add_business_days(
      current_date,
      greatest(v_production_time_days, 0) + greatest(v_company_delivery_days, 0)
    );
  end if;

  update public.orders
  set estimated_delivery_date = v_estimated_delivery_date
  where id = v_order_id;

  return v_result || jsonb_build_object(
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
