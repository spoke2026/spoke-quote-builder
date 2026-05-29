import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { parseMoney } from '@/lib/products';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let masterRows: Record<string, string>[] = [];

    if (Array.isArray(req.body?.rows)) {
      masterRows = req.body.rows;
    } else {
      const sheetsId = process.env.GOOGLE_SHEETS_ID;
      const email    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const key      = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!sheetsId || !email || !key) {
        return res.status(400).json({ error: 'Google Sheets credentials not configured' });
      }

      const accessToken = await getGoogleAccessToken(email, key);
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/Sheet1?majorDimension=ROWS`;
      const sheetsRes = await fetch(sheetsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!sheetsRes.ok) {
        const text = await sheetsRes.text();
        return res.status(500).json({ error: `Google Sheets error: ${text}` });
      }

      const json = await sheetsRes.json();
      const rows: string[][] = json.values ?? [];
      if (rows.length < 3) return res.status(400).json({ error: 'No data rows found in Google Sheet' });

      const headers = rows[1].map(h => h.trim());
      masterRows = rows.slice(2).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
        return obj;
      });
    }

    if (!masterRows.length) return res.status(400).json({ error: 'No master data rows' });

    const validRows = masterRows.filter(r => String(r['Supplier SKU'] ?? '').trim().length > 0);

    if (!validRows.length) {
      return res.status(400).json({ error: 'No valid rows found in Google Sheet' });
    }

    let updated = 0;
for (const r of validRows) {
      const supplierSku = String(r['Supplier SKU'] ?? '').trim();
      if (!supplierSku) continue;

      const updateData: Record<string, unknown> = {
        spoke_sku:   String(r['Spoke SKU'] ?? '').trim(),
        t1_price:    parseMoney(r['T1 Price']),
        t1_gp:       parseMoney(r['T1 GP%']),
        t2_price:    parseMoney(r['T2 Price']),
        t2_gp:       parseMoney(r['T2 GP%']),
        t3_price:    parseMoney(r['T3 Price']),
        t3_gp:       parseMoney(r['T3 GP%']),
        indent_price: parseMoney(r['Indent']),
        cost:        parseMoney(r['Cost']),
        gender:      String(r['Gender'] ?? '').trim(),
      };

      if (r['Spoke Description'] || r['Description']) {
        updateData.name = String(r['Spoke Description'] || r['Description'] || '').trim();
      }
      if (r['Size Range']) updateData.size = String(r['Size Range']).trim();
      if (r['Colour Options']) updateData.colour = String(r['Colour Options']).trim();

      const { data: updatedRows } = await supabase
        .from('products')
        .update(updateData)
        .eq('supplier_sku', supplierSku)
        .select('id');

      if (updatedRows && updatedRows.length > 0) {
        updated++;
      } else {
        await supabase.from('products').insert({
          supplier_sku: supplierSku,
          spoke_sku:    String(r['Spoke SKU'] ?? '').trim(),
          supplier:     String(r['Supplier'] ?? '').trim(),
          name:         String(r['Spoke Description'] || r['Description'] || '').trim(),
          size:         String(r['Size Range'] ?? '').trim(),
          colour:       String(r['Colour Options'] ?? '').trim(),
          category:     String(r['Category'] ?? '').trim(),
          gender:       String(r['Gender'] ?? '').trim(),
          cost:         parseMoney(r['Cost']),
          t1_price:     parseMoney(r['T1 Price']),
          t1_gp:        parseMoney(r['T1 GP%']),
          t2_price:     parseMoney(r['T2 Price']),
          t2_gp:        parseMoney(r['T2 GP%']),
          t3_price:     parseMoney(r['T3 Price']),
          t3_gp:        parseMoney(r['T3 GP%']),
          indent_price: parseMoney(r['Indent']),
          image_urls:   [],
        });
        updated++;
      }
    }

    return res.status(200).json({
      success: true,
      upserted: updated,
      total: validRows.length,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sync-master-data error:', message);
    return res.status(500).json({ error: message });
  }
}
async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const toSign = `${encode(header)}.${encode(payload)}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${toSign}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error(`Failed to get token: ${JSON.stringify(tokenJson)}`);
  return tokenJson.access_token;
}