-- Create payment receipts bucket for stored PDF files.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', true)
on conflict (id) do update
  set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can upload payment receipts'
  ) then
    create policy "Authenticated can upload payment receipts"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'payment-receipts');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update payment receipts'
  ) then
    create policy "Authenticated can update payment receipts"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'payment-receipts');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete payment receipts'
  ) then
    create policy "Authenticated can delete payment receipts"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'payment-receipts');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can read payment receipts'
  ) then
    create policy "Authenticated can read payment receipts"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'payment-receipts');
  end if;
end $$;
