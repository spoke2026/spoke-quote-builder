import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { mapASColourRow, normaliseHeader } from '@/lib/products';
import Papa from 'papaparse';

/**
 * POST /api/products/sync-csv
 *
 * Accepts either:
 *  - a CSV file upload (multipart/form-data, field: "csv")
 *  - a JSON body with { csvUrl: "https://..." } to fetch from SharePoint
 *
 * Upserts all rows into the products table keyed on supplier_sku.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let csvText: string | null = null;

    // Option 1: CSV URL in body (SharePoint public share link)
    if (req.body?.csvUrl) {
      const response = await fetch(req.body.csvUrl);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch CSV: ${response.statusText}` });
      }
      csvText = await response.text();
    }

    // Option 2: raw CSV text in body
    if (req.body?.csvText) {
      csvText = req.body.csvText;
    }

    if (!csvText) {
      return res.status(400).json({ error: 'Provide csvUrl or csvText in request body' });
    }

    // Parse CSV
    const { data, errors } = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),  // keep original headers; we normalise in mapASColourRow
    });

    if (errors.length > 0) {
      console.warn('CSV parse warnings:', errors.slice(0, 5));
    }

    if (!data.length) {
      return res.status(400).json({ error: 'No rows found in CSV' });
    }

    // Map rows to NormalisedProduct and then to DB shape
    const products = data
      .map((row, i) => {
        // Build a normalised-key version of the row
        const normRow: Record<string, string> = {};
        Object.keys(row).forEach((k) => {
          normRow[normaliseHeader(k)] = row[k];
          normRow[k] = row[k]; // also keep original keys
        });
        return mapASColourRow(normRow, i);
      })
      .filter((p) => p.name || p.stockCode);

    // Upsert to Supabase (insert or update on supplier_sku conflict)
    const dbRows = products.map((p) => ({
      stock_code:   p.stockCode,
      style_code:   p.styleCode,
      supplier_sku: p.supplierSku || p.stockCode,
      name:         p.name,
      colour:       p.colour,
      size:         p.size,
      category:     p.category,
      supplier:     'AS Colour',
      t1_price:     p.t1Price,
      image_urls:   p.imageUrls,
    }));

    const { error, count } = await supabase
      .from('products')
      .upsert(dbRows, { onConflict: 'supplier_sku', count: 'exact' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      upserted: count,
      total: products.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sync-csv error:', message);
    return res.status(500).json({ error: message });
  }
}
