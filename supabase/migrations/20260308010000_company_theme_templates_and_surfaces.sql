alter table public.company_theme
  add column if not exists card_color text not null default '#ffffff',
  add column if not exists border_color text not null default '#d9e2ec',
  add column if not exists border_size text not null default 'normal';

update public.company_theme
set
  card_color = coalesce(card_color, '#ffffff'),
  border_color = coalesce(border_color, '#d9e2ec'),
  border_size = coalesce(border_size, 'normal');

alter table public.company_theme
  drop constraint if exists company_theme_border_size_check;

alter table public.company_theme
  add constraint company_theme_border_size_check
  check (border_size in ('thin', 'normal', 'thick'));

update public.company_theme
set light_palette = jsonb_set(
  jsonb_set(
    coalesce(light_palette, '{}'::jsonb),
    '{card_color}',
    to_jsonb(coalesce(light_palette ->> 'card_color', card_color, '#ffffff')),
    true
  ),
  '{border_color}',
  to_jsonb(coalesce(light_palette ->> 'border_color', border_color, '#d9e2ec')),
  true
)
where light_palette is not null;

update public.company_theme
set dark_palette = jsonb_set(
  jsonb_set(
    coalesce(dark_palette, '{}'::jsonb),
    '{card_color}',
    to_jsonb(coalesce(dark_palette ->> 'card_color', '#111b2e')),
    true
  ),
  '{border_color}',
  to_jsonb(coalesce(dark_palette ->> 'border_color', '#22314a')),
  true
)
where dark_palette is not null;
