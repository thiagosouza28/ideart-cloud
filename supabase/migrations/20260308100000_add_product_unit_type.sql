alter table public.products
add column if not exists unit_type text not null default 'unidade';

update public.products
set unit_type = 'unidade'
where unit_type is null or btrim(unit_type) = '';
