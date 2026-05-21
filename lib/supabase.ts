import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lehrjxiabetjrmmrytjd.supabase.co';
const supabaseAnonKey = 'sb_publishable_0HWTwU3YR4QcGOXGhKbCBA_Uy4aS6Pi';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Database types ────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  stock_code: string;        // AS Colour stockCode
  style_code: string;        // AS Colour styleCode
  supplier_sku: string;      // Master Data: Supplier SKU
  spoke_sku: string;         // Master Data: Spoke SKU
  supplier: string;
  name: string;
  description: string;
  size: string;
  colour: string;
  category: string;
  gender: string;
  cost: number;
  t1_price: number;
  t1_gp: number;
  t2_price: number;
  t2_gp: number;
  t3_price: number;
  t3_gp: number;
  image_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  title: string;
  customer_name: string;
  intro_headline: string;
  intro_copy: string;
  contact_email: string;
  contact_phone: string;
  output_type: 'quote' | 'pricelist';
  pricing_tier: 'T1' | 'T2' | 'T3';
  line_items: QuoteLineItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
  share_token: string;  // unique token for shareable link
}

export interface QuoteLineItem {
  product_id: string;
  product_snapshot: Partial<Product>;  // frozen copy of product data
  qty: number;
  logo_count: number;
  unit_price: number;
  logo_price: number;
  line_total: number;
}
