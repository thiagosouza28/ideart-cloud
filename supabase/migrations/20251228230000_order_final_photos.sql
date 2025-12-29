-- Ensure order final photos bucket exists and is public for direct access.
insert into storage.buckets (id, name, public)
values ('order-final-photos', 'order-final-photos', true)
on conflict (id) do update
  set public = excluded.public;

create table if not exists public.order_final_photos (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  constraint order_final_photos_pkey primary key (id)
);

alter table public.order_final_photos enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_final_photos'
      and policyname = 'Authenticated can view order final photos'
  ) then
    create policy "Authenticated can view order final photos"
      on public.order_final_photos
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_final_photos'
      and policyname = 'Authenticated can insert order final photos'
  ) then
    create policy "Authenticated can insert order final photos"
      on public.order_final_photos
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_final_photos'
      and policyname = 'Authenticated can delete order final photos'
  ) then
    create policy "Authenticated can delete order final photos"
      on public.order_final_photos
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
      and policyname = 'Authenticated can upload order final photos'
  ) then
    create policy "Authenticated can upload order final photos"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'order-final-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update order final photos'
  ) then
    create policy "Authenticated can update order final photos"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'order-final-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete order final photos'
  ) then
    create policy "Authenticated can delete order final photos"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'order-final-photos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can read order final photos'
  ) then
    create policy "Authenticated can read order final photos"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'order-final-photos');
  end if;
end $$;
