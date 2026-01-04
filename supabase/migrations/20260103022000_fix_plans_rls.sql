drop policy if exists "Super admin can manage plans" on public.plans;

create policy "Super admin can manage plans"
  on public.plans
  for all
  using (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));
