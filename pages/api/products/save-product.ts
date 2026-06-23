import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') return handleSave(req, res);
  if (req.method === 'PUT') return handleUpdate(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSave(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { product } = req.body;
    if (!product) return res.status(400).json({ error: 'Product data required' });

    // Check for duplicate supplier SKU
    if (product.supplierSku) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id, name')
        .eq('supplier_sku', product.supplierSku)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'duplicate',
          existingId: existing.id,
          existingName: existing.name,
          message: `A product with SKU "${product.supplierSku}" already exists: "${existing.name}". Do you want to update it instead?`,
        });
      }
    }

    const { data, error } = await supabaseAdmin
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
        features:          product.features || [],
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await appendToGoogleSheet(product);

    return res.status(200).json({ success: true, id: data?.id });

  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleUpdate(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, product } = req.body;
    if (!id || !product) return res.status(400).json({ error: 'id and product required' });

    const { error } = await supabaseAdmin
      .from('products')
      .update({
        supplier_sku:      product.supplierSku || '',
        spoke_sku:         product.spokeSku || '',
        supplier:          product.supplier || '',
        name:              product.name || '',
        description:       product.description || '',
        short_description: product.shortDescription || '',
        size:              product.sizes || product.size || '',
        colour:            product.colours || product.colour || '',
        category:          product.category || '',
        gender:            product.gender || '',
        composition:       product.composition || '',
        image_urls:        product.imageUrls || [],
        features:          product.features || [],
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });

  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function appendToGoogleSheet(product: Record<string, unknown>) {
  const sheetsId = process.env.GOOGLE_SHEETS_ID;
  const email    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key      = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!sheetsId || !email || !key) return;

  try {
    const accessToken = await getGoogleAccessToken(email, key);
    const newRow = [
      product.supplierSku || '',
      product.spokeSku || '',
      product.supplier || '',
      product.name || '',
      product.sizes || product.size || '',
      product.colours || product.colour || '',
      product.category || '',
      product.gender || '',
      '', '', '', '', '', '', '',
    ];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/Sheet1!A:O:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [newRow] }),
      }
    );
  } catch (err) {
    console.error('Google Sheets append error:', err);
  }
}

async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const toSign = `${encode(header)}.${encode(payload)}`;
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(toSign);
  const jwt = `${toSign}.${sign.sign(privateKey, 'base64url')}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = await tokenRes.json();
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`);
  return json.access_token;
}
