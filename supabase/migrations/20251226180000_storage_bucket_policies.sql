-- Ensure product-images bucket exists and is public for direct access.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update
  set public = excluded.public;

-- Storage policies for authenticated users.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can upload product images'
  ) then
    create policy "Authenticated can upload product images"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'product-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update product images'
  ) then
    create policy "Authenticated can update product images"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'product-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete product images'
  ) then
    create policy "Authenticated can delete product images"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'product-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can read product images'
  ) then
    create policy "Authenticated can read product images"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'product-images');
  end if;
end $$;
