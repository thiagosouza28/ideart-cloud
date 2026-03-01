-- Add store geolocation fields for public nearby-store discovery.

alter table public.companies
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_latitude_range_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_latitude_range_check
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_longitude_range_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_longitude_range_check
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;
end $$;

create index if not exists companies_city_idx
  on public.companies (lower(city));

create index if not exists companies_lat_lng_idx
  on public.companies (latitude, longitude);

