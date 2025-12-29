-- Add track_stock to products to allow optional stock control.
alter table public.products
  add column if not exists track_stock boolean not null default true;

update public.products
set track_stock = true
where track_stock is null;
