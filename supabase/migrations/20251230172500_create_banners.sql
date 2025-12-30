-- Create banners table
CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  position TEXT NOT NULL CHECK (position IN ('catalog', 'dashboard')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- Users can view their company banners (all positions)
CREATE POLICY "Users can view their company banners"
  ON banners FOR SELECT
  USING (company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  ));

-- Admins can manage their company banners
CREATE POLICY "Admins can manage their company banners"
  ON banners FOR ALL
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Public access for catalog banners (so they show up on the public catalog page)
CREATE POLICY "Public can view active catalog banners"
  ON banners FOR SELECT
  USING (position = 'catalog' AND is_active = true);
