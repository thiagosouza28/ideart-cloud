-- Add multiple product images support (up to 5).

alter table public.products
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.products
    add constraint products_image_urls_is_array
    check (jsonb_typeof(image_urls) = 'array');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.products
    add constraint products_image_urls_max_length
    check (jsonb_array_length(image_urls) <= 5);
exception
  when duplicate_object then null;
end $$;

update public.products
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and (image_urls is null or jsonb_array_length(image_urls) = 0);
