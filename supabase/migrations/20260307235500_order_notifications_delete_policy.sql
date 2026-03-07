do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Authenticated can delete order notifications'
  ) then
    create policy "Authenticated can delete order notifications"
      on public.order_notifications
      for delete
      to authenticated
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
      );
  end if;
end $$;
