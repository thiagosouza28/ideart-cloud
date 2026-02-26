-- Restrict product domain data to the authenticated user's company.
-- Keeps public catalog policies (anon) untouched.

-- Products
drop policy if exists "Authenticated can view products" on public.products;
drop policy if exists "Admin/Atendente can manage products" on public.products;
drop policy if exists "Products select by company" on public.products;
drop policy if exists "Products insert by company" on public.products;
drop policy if exists "Products update by company" on public.products;
drop policy if exists "Products delete by company" on public.products;

create policy "Products select by company"
  on public.products
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  );

create policy "Products insert by company"
  on public.products
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Products update by company"
  on public.products
  for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
        or public.has_role(auth.uid(), 'caixa'::public.app_role)
      )
      and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
        or public.has_role(auth.uid(), 'caixa'::public.app_role)
      )
      and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Products delete by company"
  on public.products
  for delete
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

-- Price tiers (child of products)
drop policy if exists "Authenticated can view price_tiers" on public.price_tiers;
drop policy if exists "Admin/Atendente can manage price_tiers" on public.price_tiers;
drop policy if exists "Price tiers select by product company" on public.price_tiers;
drop policy if exists "Price tiers manage by product company" on public.price_tiers;

create policy "Price tiers select by product company"
  on public.price_tiers
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = price_tiers.product_id
        and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Price tiers manage by product company"
  on public.price_tiers
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = price_tiers.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = price_tiers.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  );

-- Product attributes (child of products)
drop policy if exists "Authenticated can view product_attributes" on public.product_attributes;
drop policy if exists "Admin/Atendente can manage product_attributes" on public.product_attributes;
drop policy if exists "Product attributes select by product company" on public.product_attributes;
drop policy if exists "Product attributes manage by product company" on public.product_attributes;

create policy "Product attributes select by product company"
  on public.product_attributes
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = product_attributes.product_id
        and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Product attributes manage by product company"
  on public.product_attributes
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = product_attributes.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = product_attributes.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  );

-- Product supplies (child of products)
drop policy if exists "Authenticated can view product_supplies" on public.product_supplies;
drop policy if exists "Admin/Atendente can manage product_supplies" on public.product_supplies;
drop policy if exists "Product supplies select by product company" on public.product_supplies;
drop policy if exists "Product supplies manage by product company" on public.product_supplies;

create policy "Product supplies select by product company"
  on public.product_supplies
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = product_supplies.product_id
        and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Product supplies manage by product company"
  on public.product_supplies
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = product_supplies.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'atendente'::public.app_role)
      )
      and exists (
        select 1
        from public.products pr
        where pr.id = product_supplies.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
  );

-- Stock movements (child of products)
drop policy if exists "Authenticated can view stock_movements" on public.stock_movements;
drop policy if exists "Authenticated can insert stock_movements" on public.stock_movements;
drop policy if exists "Authenticated can update latest stock movements" on public.stock_movements;
drop policy if exists "Stock movements select by product company" on public.stock_movements;
drop policy if exists "Stock movements insert by product company" on public.stock_movements;
drop policy if exists "Stock movements update latest by product company" on public.stock_movements;

create policy "Stock movements select by product company"
  on public.stock_movements
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = stock_movements.product_id
        and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Stock movements insert by product company"
  on public.stock_movements
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or exists (
      select 1
      from public.products pr
      where pr.id = stock_movements.product_id
        and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Stock movements update latest by product company"
  on public.stock_movements
  for update
  to authenticated
  using (
    (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.products pr
        where pr.id = stock_movements.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
    and (
      not exists (
        select 1
        from public.stock_movements sm2
        where sm2.product_id = stock_movements.product_id
          and sm2.created_at > stock_movements.created_at
      )
    )
  )
  with check (
    (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists (
        select 1
        from public.products pr
        where pr.id = stock_movements.product_id
          and pr.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
      )
    )
    and (
      not exists (
        select 1
        from public.stock_movements sm2
        where sm2.product_id = stock_movements.product_id
          and sm2.created_at > stock_movements.created_at
      )
    )
  );
