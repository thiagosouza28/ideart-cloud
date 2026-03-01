-- Support up to 3 images per product review and allow public upload.

alter table public.product_reviews
  add column if not exists review_image_urls text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_reviews_image_limit_check'
      and conrelid = 'public.product_reviews'::regclass
  ) then
    alter table public.product_reviews
      add constraint product_reviews_image_limit_check
      check (coalesce(array_length(review_image_urls, 1), 0) <= 3);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('product-review-images', 'product-review-images', true)
on conflict (id) do nothing;

drop policy if exists "Product review images public read" on storage.objects;
drop policy if exists "Product review images public upload" on storage.objects;
drop policy if exists "Product review images admin delete" on storage.objects;

create policy "Product review images public read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-review-images');

create policy "Product review images public upload"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'product-review-images'
    and array_length(storage.foldername(storage.objects.name), 1) >= 2
    and exists (
      select 1
      from public.products p
      join public.companies c on c.id = p.company_id
      where p.company_id::text = (storage.foldername(storage.objects.name))[1]
        and p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.is_active = true
        and (coalesce(p.catalog_enabled, false) = true or p.show_in_catalog = true)
        and c.is_active = true
    )
  );

create policy "Product review images admin delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-review-images'
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or (
        array_length(storage.foldername(storage.objects.name), 1) >= 1
        and (storage.foldername(storage.objects.name))[1]::uuid = public.current_company_id()
      )
    )
  );
