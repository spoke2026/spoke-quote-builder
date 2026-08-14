import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { mapStockItemRow, mapASColourRow, normaliseHeader } from '@/lib/products';
import { requireUser } from '@/lib/supabase/api';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { rows, isFirst } = req.body;

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    // Detect CSV type
    const headers = Object.keys(rows[0] || {});
    const isStockItems = headers.includes('stockCode') && headers.includes('styleName');

    const products = rows.map((row: Record<string, string>, i: number) => {
      if (isStockItems) return mapStockItemRow(row, i);
      const normRow: Record<string, string> = {};
      Object.keys(row).forEach(k => { normRow[normaliseHeader(k)] = row[k]; normRow[k] = row[k]; });
      return mapASColourRow(normRow, i);
    }).filter((p) => p.name || p.stockCode);

    // Group by styleCode
    const styleMap = new Map<string, {
      stockCode: string;
      styleCode: string;
      name: string;
      description: string;
      shortDescription: string;
      category: string;
      composition: string;
      t1Price: number;
      imageUrls: string[];
      sizes: string[];
      colours: string[];
    }>();

    for (const p of products) {
      const key = p.styleCode || p.stockCode;
      if (!styleMap.has(key)) {
        styleMap.set(key, {
          stockCode: p.stockCode,
          styleCode: p.styleCode,
          name: p.name,
          description: p.description,
          shortDescription: p.shortDescription,
          category: p.category,
          composition: p.composition,
          t1Price: p.t1Price,
          imageUrls: [...p.imageUrls],
          sizes: p.size ? [p.size] : [],
          colours: p.colour ? [p.colour] : [],
        });
      } else {
        const existing = styleMap.get(key)!;
        for (const img of p.imageUrls) {
          if (!existing.imageUrls.includes(img)) existing.imageUrls.push(img);
        }
        if (p.size && !existing.sizes.includes(p.size)) existing.sizes.push(p.size);
        if (p.colour && !existing.colours.includes(p.colour)) existing.colours.push(p.colour);
      }
    }

    const dbRows = Array.from(styleMap.values()).map(p => ({
      stock_code:        p.stockCode,
      style_code:        p.styleCode,
      supplier_sku:      p.styleCode || p.stockCode,
      name:              p.name,
      description:       p.description,
      short_description: p.shortDescription,
      colour:            p.colours.join(', '),
      size:              p.sizes.join(', '),
      category:          p.category,
      composition:       p.composition,
      supplier:          'AS Colour',
      t1_price:          p.t1Price,
      image_urls:        p.imageUrls.slice(0, 10),
    }));

    // On first chunk, delete existing AS Colour products
    if (isFirst) {
      await supabaseAdmin.from('products').delete().eq('supplier', 'AS Colour');
    }

    // Insert chunk
    if (dbRows.length > 0) {
      const { error } = await supabaseAdmin.from('products').insert(dbRows);
      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    return res.status(200).json({
      success: true,
      upserted: dbRows.length,
      total: dbRows.length,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sync-csv error:', message);
    return res.status(500).json({ error: message });
  }
}