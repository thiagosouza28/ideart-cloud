do $$
declare
  rec record;
  v_sql text;
begin
  create temporary table if not exists company_merge_map (
    from_id uuid primary key,
    to_id uuid not null
  ) on commit drop;

  insert into company_merge_map (from_id, to_id)
  with ranked as (
    select
      id,
      created_at,
      coalesce(owner_user_id::text, lower(email)) as merge_key,
      row_number() over (
        partition by coalesce(owner_user_id::text, lower(email))
        order by created_at asc nulls last, id asc
      ) as rn,
      first_value(id) over (
        partition by coalesce(owner_user_id::text, lower(email))
        order by created_at asc nulls last, id asc
      ) as keep_id
    from public.companies
    where coalesce(owner_user_id::text, lower(email)) is not null
  )
  select id as from_id, keep_id as to_id
  from ranked
  where rn > 1
  on conflict (from_id) do nothing;

  delete from public.company_users cu
  using company_merge_map m
  where cu.company_id = m.from_id
    and exists (
      select 1
      from public.company_users cu2
      where cu2.company_id = m.to_id
        and cu2.user_id = cu.user_id
    );

  update public.company_users cu
  set company_id = m.to_id
  from company_merge_map m
  where cu.company_id = m.from_id;

  for rec in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'company_id'
      and table_name not in ('companies', 'company_users')
  loop
    v_sql := format(
      'update %I.%I t set company_id = m.to_id from company_merge_map m where t.company_id = m.from_id',
      rec.table_schema,
      rec.table_name
    );
    execute v_sql;
  end loop;

  update public.companies c
  set
    owner_user_id = coalesce(c.owner_user_id, s.owner_user_id),
    email = coalesce(c.email, s.email)
  from company_merge_map m
  join public.companies s on s.id = m.from_id
  where c.id = m.to_id;

  delete from public.company_users a
  using public.company_users b
  where a.id > b.id
    and a.company_id = b.company_id
    and a.user_id = b.user_id;

  update public.companies
  set is_active = false
  where id in (select from_id from company_merge_map);
end $$;
