alter table public.companies
add column if not exists completed boolean not null default false;

alter table public.profiles
add column if not exists password_defined boolean not null default false;
