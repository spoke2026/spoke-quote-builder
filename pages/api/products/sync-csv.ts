import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { mapStockItemRow, mapASColourRow, normaliseHeader } from '@/lib/products';
import Papa from 'papaparse';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let csvText: string | null = null;

    if (req.body?.csvUrl) {
      const response = await fetch(req.body.csvUrl);
      if (!response.ok) return res.status(400).json({ error: `Failed to fetch CSV` });
      csvText = await response.text();
    } else {
      // Read raw body stream
      csvText = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString('utf8'); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
    }

    if (!csvText) return res.status(400).json({ error: 'No CSV data provided' });

    const { data, errors } = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (errors.length > 0) console.warn('CSV parse warnings:', errors.slice(0, 3));
    if (!data.length) return res.status(400).json({ error: 'No rows found in CSV' });

    const headers = Object.keys(data[0] || {});
    const isStockItems = headers.includes('stockCode') && headers.includes('styleName');

    const products = data.map((row, i) => {
      if (isStockItems) return mapStockItemRow(row, i);
      const normRow: Record<string, string> = {};
      Object.keys(row).forEach(k => { normRow[normaliseHeader(k)] = row[k]; normRow[k] = row[k]; });
      return mapASColourRow(normRow, i);
    }).filter(p => p.name || p.stockCode);
const styleMap = new Map<string, {
      stockCode: string;
      styleCode: string;
      name: string;
      description: string;
      shortDescription: string;
      colour: string;
      size: string;
      category: string;
      composition: string;
      t1Price: number;
      imageUrls: string[];
      sizes: Set<string>;
      colours: Set<string>;
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
          colour: p.colour,
          size: p.size,
          category: p.category,
          composition: p.composition,
          t1Price: p.t1Price,
          imageUrls: [...p.imageUrls],
          sizes: new Set([p.size].filter(Boolean)),
          colours: new Set([p.colour].filter(Boolean)),
        });
      } else {
        const existing = styleMap.get(key)!;
        for (const img of p.imageUrls) {
          if (!existing.imageUrls.includes(img)) existing.imageUrls.push(img);
        }
        if (p.size) existing.sizes.add(p.size);
        if (p.colour) existing.colours.add(p.colour);
      }
    }

    const dbRows = Array.from(styleMap.values()).map(p => ({
      stock_code:        p.stockCode,
      style_code:        p.styleCode,
      supplier_sku:      p.styleCode || p.stockCode,
      name:              p.name,
      description:       p.description,
      short_description: p.shortDescription,
      colour:            Array.from(p.colours).join(', '),
      size:              Array.from(p.sizes).join(', '),
      category:          p.category,
      composition:       p.composition,
      supplier:          'AS Colour',
      t1_price:          p.t1Price,
      image_urls:        p.imageUrls.slice(0, 10),
    }));

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('supplier', 'AS Colour');

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    const chunkSize = 50;
    let totalInserted = 0;

    for (let i = 0; i < dbRows.length; i += chunkSize) {
      const chunk = dbRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('products').insert(chunk);
      if (error) {
        console.error('Insert error at chunk', i, error);
        return res.status(500).json({ error: error.message });
      }
      totalInserted += chunk.length;
    }

    return res.status(200).json({
      success: true,
      upserted: totalInserted,
      total: dbRows.length,
      type: isStockItems ? 'StockItems' : 'ProductVariants',
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sync-csv error:', message);
    return res.status(500).json({ error: message });
  }
}