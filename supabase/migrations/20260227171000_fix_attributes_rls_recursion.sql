-- Fix RLS recursion between attributes and attribute_values.
-- Previous policies referenced each other and could trigger 500 on SELECT.

drop policy if exists "Attribute values by company" on public.attribute_values;

create policy "Attribute values by company"
  on public.attribute_values
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = public.current_company_id()
  );
