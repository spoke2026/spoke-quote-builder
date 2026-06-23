import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/products/search?q=staple+tee&tier=T1&limit=50
 *
 * Returns products from Supabase that match the query string.
 * Falls back to full list when q is empty.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = String(req.query.q ?? '').trim();
  const tier = String(req.query.tier ?? 'T1');
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const category = String(req.query.category ?? '').trim();

  try {
    let query = supabaseAdmin
      .from('products')
      .select(
        'id, stock_code, style_code, supplier_sku, spoke_sku, supplier, name, description, short_description, size, colour, category, gender, composition, t1_price, t2_price, t3_price, indent_price, image_urls, features'
      )
      .limit(limit);

    if (q) {
      // Use ilike for simple substring search — works well for SKUs and product names
      query = query.or(
        `name.ilike.%${q}%,supplier_sku.ilike.%${q}%,spoke_sku.ilike.%${q}%,colour.ilike.%${q}%,category.ilike.%${q}%`
      );
    }

    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    // Order by name ascending
    query = query.order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Attach the correct display price based on tier
    const tierField: Record<string, string> = {
      T1:     't1_price',
      T2:     't2_price',
      T3:     't3_price',
      Indent: 'indent_price',
    };
    const priceField = tierField[tier] ?? 't1_price';

    const results = (data ?? []).map((row) => ({
      ...row,
      display_price: (row as Record<string, number>)[priceField] ?? row.t1_price,
    }));

    return res.status(200).json({ products: results, total: results.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('search error:', message);
    return res.status(500).json({ error: message });
  }
}
