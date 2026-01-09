-- Add customer birth date/photo fields and storage bucket for customer photos.

alter table public.customers
  add column if not exists date_of_birth date;

alter table public.customers
  add column if not exists photo_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_birth_date_not_future'
  ) then
    alter table public.customers
      add constraint customers_birth_date_not_future
      check (date_of_birth is null or date_of_birth <= current_date);
  end if;
end $$;

-- Ensure customer-photos bucket exists and is public for direct access.
insert into storage.buckets (id, name, public)
values ('customer-photos', 'customer-photos', true)
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
      and policyname = 'Authenticated can upload customer photos'
  ) then
    create policy "Authenticated can upload customer photos"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'customer-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update customer photos'
  ) then
    create policy "Authenticated can update customer photos"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'customer-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete customer photos'
  ) then
    create policy "Authenticated can delete customer photos"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'customer-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can read customer photos'
  ) then
    create policy "Authenticated can read customer photos"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'customer-photos');
  end if;
end $$;
