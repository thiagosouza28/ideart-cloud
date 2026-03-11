-- Allow public contact form submissions and Super Admin management of notifications

-- 1. Allow anyone (anon and authenticated) to insert contact form notifications
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Anyone can insert contact form notifications'
  ) then
    create policy "Anyone can insert contact form notifications"
      on public.order_notifications
      for insert
      to anon, authenticated
      with check (
        type = 'contact_form'
      );
  end if;
end $$;

-- 2. Allow Super Admins to view all notifications (including those with null company_id)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Super admins can view all order notifications'
  ) then
    create policy "Super admins can view all order notifications"
      on public.order_notifications
      for select
      to authenticated
      using (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
      );
  end if;
end $$;

-- 3. Allow Super Admins to update all notifications (to mark as read)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Super admins can update all order notifications'
  ) then
    create policy "Super admins can update all order notifications"
      on public.order_notifications
      for update
      to authenticated
      using (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
      )
      with check (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
      );
  end if;
end $$;

-- 4. Allow Super Admins to delete all notifications
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'Super admins can delete all order notifications'
  ) then
    create policy "Super admins can delete all order notifications"
      on public.order_notifications
      for delete
      to authenticated
      using (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
      );
  end if;
end $$;

-- 5. Grant permissions to anon and authenticated roles
grant insert on table public.order_notifications to anon, authenticated;
grant select, update, delete on table public.order_notifications to authenticated;
