-- Order public links, payments, approvals, and notifications

alter type public.order_status add value if not exists 'pendente' before 'em_producao';

alter table public.orders
  add column if not exists company_id uuid,
  add column if not exists approved_at timestamp with time zone,
  add column if not exists approved_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_company_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_company_id_fkey
      foreign key (company_id) references public.companies(id);
  end if;
end $$;

update public.orders o
set company_id = p.company_id
from public.profiles p
where o.company_id is null
  and o.created_by = p.id
  and p.company_id is not null;

create table if not exists public.order_public_links (
  id uuid default gen_random_uuid() primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  created_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists order_public_links_order_id_key
  on public.order_public_links(order_id);

create table if not exists public.order_payments (
  id uuid default gen_random_uuid() primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  company_id uuid references public.companies(id),
  amount numeric(10,2) not null,
  status public.payment_status not null default 'pendente',
  method public.payment_method,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  notes text
);

create index if not exists order_payments_order_id_idx
  on public.order_payments(order_id);

create table if not exists public.order_notifications (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id),
  order_id uuid references public.orders(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  created_at timestamp with time zone not null default now(),
  read_at timestamp with time zone
);

create index if not exists order_notifications_company_id_idx
  on public.order_notifications(company_id);

alter table public.order_public_links enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_notifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_public_links'
      and policyname = 'Authenticated can manage order public links'
  ) then
    create policy "Authenticated can manage order public links"
      on public.order_public_links
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.orders o
          join public.profiles p on p.id = auth.uid()
          where o.id = order_public_links.order_id
            and o.company_id = p.company_id
        )
      )
      with check (
        exists (
          select 1
          from public.orders o
          join public.profiles p on p.id = auth.uid()
          where o.id = order_public_links.order_id
            and o.company_id = p.company_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_payments'
      and policyname = 'Authenticated can manage order payments'
  ) then
    create policy "Authenticated can manage order payments"
      on public.order_payments
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.company_id = order_payments.company_id
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.company_id = order_payments.company_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Authenticated can view order notifications'
  ) then
    create policy "Authenticated can view order notifications"
      on public.order_notifications
      for select
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Authenticated can insert order notifications'
  ) then
    create policy "Authenticated can insert order notifications"
      on public.order_notifications
      for insert
      to authenticated
      with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Authenticated can update order notifications'
  ) then
    create policy "Authenticated can update order notifications"
      on public.order_notifications
      for update
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;
end $$;

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
        'notes', p.notes
      ) order by p.created_at desc)
      from public.order_payments p
      where p.order_id = o.id
    ), '[]'::jsonb)
  )
  into result
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join public.companies co on co.id = o.company_id
  where o.id = v_order_id;

  return result;
end $$;

create or replace function public.approve_order_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_company_id uuid;
  v_order_number integer;
begin
  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    raise exception 'Invalid token';
  end if;

  select company_id, order_number
    into v_company_id, v_order_number
  from public.orders
  where id = v_order_id;

  update public.orders
  set status = 'pendente',
      approved_at = now(),
      approved_by = 'cliente',
      updated_at = now()
  where id = v_order_id
    and status = 'orcamento';

  if found then
    insert into public.order_status_history (order_id, status, notes, user_id)
    values (v_order_id, 'pendente', 'Orcamento aprovado pelo cliente', null);

    insert into public.order_notifications (company_id, order_id, type, title, body)
    values (
      v_company_id,
      v_order_id,
      'approval',
      'Orcamento aprovado',
      format('Pedido #%s aprovado pelo cliente.', v_order_number)
    );
  end if;

  return public.get_public_order(p_token);
end $$;

create or replace function public.record_order_payment_by_token(
  p_token text,
  p_amount numeric,
  p_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_order_id uuid;
  v_company_id uuid;
  v_order_number integer;
  v_order_total numeric(10,2);
  v_paid_total numeric(10,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select order_id
    into v_order_id
  from public.order_public_links
  where token = p_token;

  if v_order_id is null then
    raise exception 'Invalid token';
  end if;

  select company_id, total, order_number
    into v_company_id, v_order_total, v_order_number
  from public.orders
  where id = v_order_id;

  insert into public.order_payments (
    order_id,
    company_id,
    amount,
    status,
    method,
    paid_at,
    created_by
  )
  values (
    v_order_id,
    v_company_id,
    p_amount,
    'pago',
    p_method,
    now(),
    null
  );

  select coalesce(sum(amount), 0)
    into v_paid_total
  from public.order_payments
  where order_id = v_order_id
    and status = 'pago';

  update public.orders
  set amount_paid = v_paid_total,
      payment_status = case
        when v_paid_total >= v_order_total then 'pago'
        else 'parcial'
      end,
      payment_method = coalesce(p_method, payment_method),
      updated_at = now()
  where id = v_order_id;

  insert into public.order_notifications (company_id, order_id, type, title, body)
  values (
    v_company_id,
    v_order_id,
    'payment',
    'Pagamento recebido',
    format('Pagamento registrado para o pedido #%s.', v_order_number)
  );

  return public.get_public_order(p_token);
end $$;
