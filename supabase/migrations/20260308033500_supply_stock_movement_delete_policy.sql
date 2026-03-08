drop policy if exists "Supply stock movements delete by company roles" on public.supply_stock_movements;
create policy "Supply stock movements delete by company roles"
on public.supply_stock_movements
for delete
to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'financeiro'::public.app_role)
    or public.has_role(auth.uid(), 'atendente'::public.app_role)
    or public.has_role(auth.uid(), 'caixa'::public.app_role)
    or public.has_role(auth.uid(), 'producao'::public.app_role)
  )
);
