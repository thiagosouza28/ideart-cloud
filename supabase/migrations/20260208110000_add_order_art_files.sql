-- Ensure order art files bucket exists and is public for direct access.
insert into storage.buckets (id, name, public)
values ('order-art-files', 'order-art-files', true)
on conflict (id) do update
  set public = excluded.public;

create table if not exists public.order_art_files (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  constraint order_art_files_pkey primary key (id)
);

alter table public.order_art_files enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_art_files'
      and policyname = 'Authenticated can view order art files'
  ) then
    create policy "Authenticated can view order art files"
      on public.order_art_files
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_art_files'
      and policyname = 'Authenticated can insert order art files'
  ) then
    create policy "Authenticated can insert order art files"
      on public.order_art_files
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_art_files'
      and policyname = 'Authenticated can delete order art files'
  ) then
    create policy "Authenticated can delete order art files"
      on public.order_art_files
      for delete
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can upload order art files'
  ) then
    create policy "Authenticated can upload order art files"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'order-art-files');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update order art files'
  ) then
    create policy "Authenticated can update order art files"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'order-art-files');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete order art files'
  ) then
    create policy "Authenticated can delete order art files"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'order-art-files');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can read order art files'
  ) then
    create policy "Authenticated can read order art files"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'order-art-files');
  end if;
end $$;
