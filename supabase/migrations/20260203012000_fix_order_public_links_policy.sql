drop policy if exists "Authenticated can manage order public links" on public.order_public_links;

create policy "Authenticated can manage order public links"
  on public.order_public_links
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      left join public.profiles p on p.id = auth.uid()
      where o.id = order_public_links.order_id
        and (
          o.company_id = p.company_id
          or o.created_by = auth.uid()
        )
    )
    or exists (
      select 1
      from public.user_roles r
      where r.user_id = auth.uid()
        and r.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      left join public.profiles p on p.id = auth.uid()
      where o.id = order_public_links.order_id
        and (
          o.company_id = p.company_id
          or o.created_by = auth.uid()
        )
    )
    or exists (
      select 1
      from public.user_roles r
      where r.user_id = auth.uid()
        and r.role = 'super_admin'
    )
  );
