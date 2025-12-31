-- Migration: Add promotion fields to products table
-- Created at: 2025-12-30 22:15:00

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS promo_price numeric,
ADD COLUMN IF NOT EXISTS promo_start_at timestamptz,
ADD COLUMN IF NOT EXISTS promo_end_at timestamptz;

-- Documentation comments
COMMENT ON COLUMN public.products.promo_price IS 'Preço promocional do produto';
COMMENT ON COLUMN public.products.promo_start_at IS 'Data e hora de início da promoção';
COMMENT ON COLUMN public.products.promo_end_at IS 'Data e hora de término da promoção';
