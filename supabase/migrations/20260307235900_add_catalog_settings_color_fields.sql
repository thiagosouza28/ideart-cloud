alter table public.catalog_settings
  add column if not exists accent_color text not null default '#c9a84c',
  add column if not exists header_bg_color text not null default '#1d4ed8',
  add column if not exists header_text_color text not null default '#ffffff',
  add column if not exists footer_bg_color text not null default '#1d4ed8',
  add column if not exists footer_text_color text not null default '#ffffff',
  add column if not exists price_color text not null default '#2563eb',
  add column if not exists badge_bg_color text not null default '#c9a84c',
  add column if not exists badge_text_color text not null default '#2f2406',
  add column if not exists button_bg_color text not null default '#2563eb',
  add column if not exists button_text_color text not null default '#ffffff',
  add column if not exists button_outline_color text not null default '#2563eb',
  add column if not exists card_bg_color text not null default '#ffffff',
  add column if not exists card_border_color text not null default '#e2e8f0',
  add column if not exists filter_bg_color text not null default '#2563eb',
  add column if not exists filter_text_color text not null default '#ffffff';

update public.catalog_settings cs
set
  accent_color = coalesce(
    nullif(trim(c.catalog_accent_color), ''),
    nullif(trim(cs.accent_color), ''),
    nullif(trim(cs.primary_color), ''),
    '#c9a84c'
  ),
  header_bg_color = coalesce(
    nullif(trim(c.catalog_header_bg_color), ''),
    nullif(trim(cs.header_bg_color), ''),
    nullif(trim(cs.secondary_color), ''),
    '#1d4ed8'
  ),
  header_text_color = coalesce(
    nullif(trim(c.catalog_header_text_color), ''),
    nullif(trim(cs.header_text_color), ''),
    '#ffffff'
  ),
  footer_bg_color = coalesce(
    nullif(trim(c.catalog_footer_bg_color), ''),
    nullif(trim(cs.footer_bg_color), ''),
    nullif(trim(c.catalog_header_bg_color), ''),
    nullif(trim(cs.header_bg_color), ''),
    nullif(trim(cs.secondary_color), ''),
    '#1d4ed8'
  ),
  footer_text_color = coalesce(
    nullif(trim(c.catalog_footer_text_color), ''),
    nullif(trim(cs.footer_text_color), ''),
    nullif(trim(c.catalog_header_text_color), ''),
    nullif(trim(cs.header_text_color), ''),
    '#ffffff'
  ),
  price_color = coalesce(
    nullif(trim(c.catalog_price_color), ''),
    nullif(trim(cs.price_color), ''),
    nullif(trim(c.catalog_accent_color), ''),
    nullif(trim(cs.accent_color), ''),
    nullif(trim(cs.primary_color), ''),
    '#2563eb'
  ),
  badge_bg_color = coalesce(
    nullif(trim(c.catalog_badge_bg_color), ''),
    nullif(trim(cs.badge_bg_color), ''),
    nullif(trim(c.catalog_accent_color), ''),
    nullif(trim(cs.accent_color), ''),
    '#c9a84c'
  ),
  badge_text_color = coalesce(
    nullif(trim(c.catalog_badge_text_color), ''),
    nullif(trim(cs.badge_text_color), ''),
    '#2f2406'
  ),
  button_bg_color = coalesce(
    nullif(trim(c.catalog_button_bg_color), ''),
    nullif(trim(cs.button_bg_color), ''),
    nullif(trim(cs.primary_color), ''),
    '#2563eb'
  ),
  button_text_color = coalesce(
    nullif(trim(c.catalog_button_text_color), ''),
    nullif(trim(cs.button_text_color), ''),
    '#ffffff'
  ),
  button_outline_color = coalesce(
    nullif(trim(c.catalog_button_outline_color), ''),
    nullif(trim(cs.button_outline_color), ''),
    nullif(trim(c.catalog_button_bg_color), ''),
    nullif(trim(cs.button_bg_color), ''),
    nullif(trim(cs.primary_color), ''),
    '#2563eb'
  ),
  card_bg_color = coalesce(
    nullif(trim(c.catalog_card_bg_color), ''),
    nullif(trim(cs.card_bg_color), ''),
    '#ffffff'
  ),
  card_border_color = coalesce(
    nullif(trim(c.catalog_card_border_color), ''),
    nullif(trim(cs.card_border_color), ''),
    '#e2e8f0'
  ),
  filter_bg_color = coalesce(
    nullif(trim(c.catalog_filter_bg_color), ''),
    nullif(trim(cs.filter_bg_color), ''),
    nullif(trim(c.catalog_button_bg_color), ''),
    nullif(trim(cs.button_bg_color), ''),
    nullif(trim(cs.primary_color), ''),
    '#2563eb'
  ),
  filter_text_color = coalesce(
    nullif(trim(c.catalog_filter_text_color), ''),
    nullif(trim(cs.filter_text_color), ''),
    '#ffffff'
  )
from public.companies c
where c.id = cs.store_id;
