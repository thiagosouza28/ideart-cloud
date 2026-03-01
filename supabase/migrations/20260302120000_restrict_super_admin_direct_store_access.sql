-- Restrict super_admin direct access to store operational data.
-- Super admin must manage users/companies directly and impersonate store users
-- for operational flows (orders, products, finance, etc).

do $$
declare
  table_name text;
  operational_tables text[] := array[
    'categories',
    'supplies',
    'attributes',
    'attribute_values',
    'customers',
    'products',
    'price_tiers',
    'product_attributes',
    'product_supplies',
    'stock_movements',
    'sales',
    'sale_items',
    'orders',
    'order_items',
    'order_status_history',
    'order_art_files',
    'order_final_photos',
    'order_payments',
    'order_public_links',
    'order_notifications',
    'financial_entries',
    'financial_entry_history',
    'expense_categories',
    'banners'
  ];
begin
  foreach table_name in array operational_tables loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format('drop policy if exists "Deny super admin direct access" on public.%I', table_name);
    execute format(
      'create policy "Deny super admin direct access" on public.%I as restrictive for all to authenticated using (not public.has_role(auth.uid(), ''super_admin''::public.app_role)) with check (not public.has_role(auth.uid(), ''super_admin''::public.app_role))',
      table_name
    );
  end loop;
end $$;

-- Also block direct super admin access to store file buckets.
drop policy if exists "Deny super admin direct storage access" on storage.objects;
create policy "Deny super admin direct storage access"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id not in (
      'product-images',
      'customer-photos',
      'order-art-files',
      'order-final-photos',
      'payment-receipts',
      'product-review-images'
    )
    or not public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  with check (
    bucket_id not in (
      'product-images',
      'customer-photos',
      'order-art-files',
      'order-final-photos',
      'payment-receipts',
      'product-review-images'
    )
    or not public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
