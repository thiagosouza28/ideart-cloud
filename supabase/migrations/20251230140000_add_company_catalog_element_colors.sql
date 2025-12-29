-- Add catalog element color customization fields.
alter table public.companies
  add column if not exists catalog_header_bg_color text,
  add column if not exists catalog_header_text_color text,
  add column if not exists catalog_footer_bg_color text,
  add column if not exists catalog_footer_text_color text,
  add column if not exists catalog_price_color text,
  add column if not exists catalog_badge_bg_color text,
  add column if not exists catalog_badge_text_color text,
  add column if not exists catalog_button_bg_color text,
  add column if not exists catalog_button_text_color text,
  add column if not exists catalog_button_outline_color text,
  add column if not exists catalog_card_bg_color text,
  add column if not exists catalog_card_border_color text,
  add column if not exists catalog_filter_bg_color text,
  add column if not exists catalog_filter_text_color text;
