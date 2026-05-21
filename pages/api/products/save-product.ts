import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { product } = req.body;
    if (!product) return res.status(400).json({ error: 'Product data required' });

    const { data, error } = await supabase
      .from('products')
      .insert({
        supplier_sku:      product.supplierSku || '',
        spoke_sku:         product.spokeSku || '',
        supplier:          product.supplier || 'Unknown',
        name:              product.name || '',
        description:       product.description || '',
        short_description: product.shortDescription || '',
        size:              product.sizes || '',
        colour:            product.colours || '',
        category:          product.category || '',
        gender:            product.gender || '',
        composition:       product.composition || '',
        cost:              0,
        t1_price:          0,
        t2_price:          0,
        t3_price:          0,
        image_urls:        product.imageUrls || [],
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    const sheetsId = process.env.GOOGLE_SHEETS_ID;
    const email    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key      = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (sheetsId && email && key) {
      try {
        const accessToken = await getGoogleAccessToken(email, key);
        const newRow = [
          product.supplierSku || '',
          product.spokeSku || '',
          product.supplier || '',
          product.name || '',
          product.sizes || '',
          product.colours || '',
          product.category || '',
          product.gender || '',
          '', '', '', '', '', '', '',
        ];

        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/Sheet1!A:O:append?valueInputOption=USER_ENTERED`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: [newRow] }),
          }
        );
      } catch (sheetErr) {
        console.error('Google Sheets append error:', sheetErr);
      }
    }

    return res.status(200).json({ success: true, id: data?.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('save-product error:', message);
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