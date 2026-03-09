ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_control_type text DEFAULT 'simple' CHECK (stock_control_type IN ('none', 'simple', 'composition'));

-- Backfill: if track_stock is false, it should probably be 'none'
UPDATE products SET stock_control_type = 'none' WHERE track_stock = false;
UPDATE products SET stock_control_type = 'simple' WHERE track_stock = true;
