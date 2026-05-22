import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const createdBy = String(req.query.created_by ?? '').trim();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  let query = supabase
    .from('quotes')
    .select('id, title, customer_name, output_type, pricing_tier, created_by, share_token, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (createdBy) query = query.eq('created_by', createdBy);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ quotes: data ?? [] });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body;
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      title:                    body.title           ?? 'Fit for work',
      customer_name:            body.customer_name   ?? '',
      intro_headline:           body.intro_headline  ?? '',
      intro_copy:               body.intro_copy      ?? '',
      contact_email:            body.contact_email   ?? 'sales@spoke.nz',
      contact_phone:            body.contact_phone   ?? '021 220 1014',
      output_type:              body.output_type     ?? 'quote',
      pricing_tier:             body.pricing_tier    ?? 'T1',
      logo_unit_price:          body.logo_unit_price ?? 0,
      setup_fee:                body.setup_fee       ?? 'Quoted per new logo',
      line_items:               body.line_items      ?? [],
      created_by:               body.created_by      ?? '',
      customer_logo_data_url:   body.customer_logo_data_url ?? null,
      hero_image_data_url:      body.hero_image_data_url    ?? null,
    })
    .select('id, share_token')
    .single();
  if (error) {
    console.error('Create quote error:', error);
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ id: data.id, share_token: data.share_token });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const body = req.body;

  // First get the existing share_token so we can return it
  const { data: existing } = await supabase
    .from('quotes')
    .select('share_token')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('quotes')
    .update({
      title:                    body.title,
      customer_name:            body.customer_name,
      intro_headline:           body.intro_headline,
      intro_copy:               body.intro_copy,
      contact_email:            body.contact_email,
      contact_phone:            body.contact_phone,
      output_type:              body.output_type,
      pricing_tier:             body.pricing_tier,
      logo_unit_price:          body.logo_unit_price,
      setup_fee:                body.setup_fee,
      line_items:               body.line_items,
      customer_logo_data_url:   body.customer_logo_data_url,
      hero_image_data_url:      body.hero_image_data_url,
    })
    .eq('id', id);

  if (error) {
    console.error('Update quote error:', error);
    return res.status(500).json({ error: error.message });
  }
  // Return the existing share_token so the share link stays the same
  return res.status(200).json({ success: true, share_token: existing?.share_token });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}
