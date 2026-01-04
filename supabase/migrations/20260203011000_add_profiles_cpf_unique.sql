alter table public.profiles
add column if not exists cpf text;

create unique index if not exists unique_profiles_cpf
on public.profiles (cpf)
where cpf is not null;
