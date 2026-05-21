import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { MasterDataRow, parseMoney } from '@/lib/products';

/**
 * POST /api/products/sync-master-data
 *
 * Reads the private Master Data Google Sheet and upserts pricing into products.
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 * and GOOGLE_SHEETS_ID env vars.
 *
 * Can also accept { rows: MasterDataRow[] } directly in the body for
 * a CSV-based fallback (paste from Sheets).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let masterRows: MasterDataRow[] = [];

    // ── Option A: rows sent directly in request body ─────────────────────────
    if (Array.isArray(req.body?.rows)) {
      masterRows = req.body.rows as MasterDataRow[];
    }

    // ── Option B: fetch from Google Sheets via service account ───────────────
    else {
      const sheetsId = process.env.GOOGLE_SHEETS_ID;
      const email    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const key      = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!sheetsId || !email || !key) {
        return res.status(400).json({
          error: 'Google Sheets credentials not configured. Set GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env.local',
        });
      }

      // Get a JWT access token using the service account
      const accessToken = await getGoogleAccessToken(email, key);

      // Fetch Sheet 1 (gid=0) as JSON
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
      if (rows.length < 2) {
        return res.status(400).json({ error: 'No data rows found in Google Sheet' });
      }

      const headers = rows[0];
      masterRows = rows.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });
        return obj as unknown as MasterDataRow;
      });
    }

    if (!masterRows.length) {
      return res.status(400).json({ error: 'No master data rows to process' });
    }

    // ── Upsert pricing into products table ───────────────────────────────────
    const updates = masterRows
      .filter((r) => r['Supplier SKU']?.trim())
      .map((r) => ({
        supplier_sku: r['Supplier SKU'].trim(),
        spoke_sku:    r['Spoke SKU']?.trim() ?? '',
        supplier:     r['Supplier']?.trim() ?? 'AS Colour',
        name:         r['Description']?.trim() ?? '',
        size:         r['Size']?.trim() ?? '',
        colour:       r['Colour']?.trim() ?? '',
        category:     r['Category']?.trim() ?? '',
        gender:       r['Gender']?.trim() ?? '',
        cost:         parseMoney(r['Cost']),
        t1_price:     parseMoney(r['T1 Price']),
        t1_gp:        parseMoney(r['T1 GP%']),
        t2_price:     parseMoney(r['T2 Price']),
        t2_gp:        parseMoney(r['T2 GP%']),
        t3_price:     parseMoney(r['T3 Price']),
        t3_gp:        parseMoney(r['T3 GP%']),
      }));

    const { error, count } = await supabase
      .from('products')
      .upsert(updates, { onConflict: 'supplier_sku', count: 'exact' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      upserted: count,
      total: updates.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sync-master-data error:', message);
    return res.status(500).json({ error: message });
  }
}

// ─── Minimal Google JWT helper ────────────────────────────────────────────────

async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const toSign = `${encode(header)}.${encode(payload)}`;

  // Use Node's built-in crypto to sign with RS256
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
  if (!tokenJson.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(tokenJson)}`);
  }

  return tokenJson.access_token;
}
