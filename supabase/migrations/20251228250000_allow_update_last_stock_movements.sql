-- Allow updating only the latest stock movement per product.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stock_movements'
      and policyname = 'Authenticated can update latest stock movements'
  ) then
    create policy "Authenticated can update latest stock movements"
      on public.stock_movements
      for update
      to authenticated
      using (
        not exists (
          select 1
          from public.stock_movements sm2
          where sm2.product_id = stock_movements.product_id
            and sm2.created_at > stock_movements.created_at
        )
      )
      with check (
        not exists (
          select 1
          from public.stock_movements sm2
          where sm2.product_id = stock_movements.product_id
            and sm2.created_at > stock_movements.created_at
        )
      );
  end if;
end $$;
