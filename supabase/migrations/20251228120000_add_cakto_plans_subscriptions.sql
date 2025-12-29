-- Migration: add CAKTO plans and subscriptions tables
-- Run with Supabase migrations or psql

-- Table: plans (CAKTO-enabled)
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'monthly', -- 'monthly' or 'yearly'
  interval_count integer NOT NULL DEFAULT 1,
  cakto_plan_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  cakto_subscription_id text,
  status text NOT NULL DEFAULT 'pending', -- active, pending, canceled, expired
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON public.subscriptions (company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_cakto_id ON public.subscriptions (cakto_subscription_id);
