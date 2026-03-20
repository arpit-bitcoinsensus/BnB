/* Run this SQL in your Supabase SQL Editor */

CREATE TABLE IF NOT EXISTS product_pricing (
  sku TEXT PRIMARY KEY,
  product_title TEXT,
  cost_price DECIMAL DEFAULT 555,
  selling_price DECIMAL DEFAULT 0,
  shipping_charge DECIMAL DEFAULT 135,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all actions for authenticated users/admins
CREATE POLICY "Enable all for all" ON product_pricing FOR ALL USING (true);
