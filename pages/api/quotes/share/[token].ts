import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { generateQuoteHTML, QuoteConfig, QuoteLineItem } from '@/lib/quote';
import { NormalisedProduct } from '@/lib/products';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = String(req.query.token ?? '').trim();
  if (!token) return res.status(400).send('<h1>Invalid link</h1>');

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('share_token', token)
    .single();

  if (error || !quote) {
    return res.status(404).send(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h1 style="color:#40514F">Quote not found</h1>
        <p>This link may have expired or been removed. Contact spoke.nz for a fresh copy.</p>
      </body></html>
    `);
  }

  const config: QuoteConfig = {
    outputType:           quote.output_type as 'quote' | 'pricelist',
    customerName:         quote.customer_name,
    title:                quote.title,
    introHeadline:        quote.intro_headline,
    introCopy:            quote.intro_copy,
    contactEmail:         quote.contact_email,
    contactPhone:         quote.contact_phone,
    tier:                 quote.pricing_tier as 'T1' | 'T2' | 'T3',
    logoUnitPrice:        0,
    setupFee:             quote.setup_fee ?? 'Quoted per new logo',
    customerLogoDataUrl:  quote.customer_logo_data_url ?? undefined,
    heroImageDataUrl:     quote.hero_image_data_url ?? undefined,
  };

  const lineItems: QuoteLineItem[] = (quote.line_items ?? []).map((item: {
    qty: number;
    category?: string;
    logos?: { id: string; position: string; price: number }[];
    product_snapshot: Partial<NormalisedProduct>;
  }) => ({
    qty:      item.qty ?? 1,
    category: item.category ?? '',
    logos:    item.logos ?? [],
    product: {
      id: '', stockCode: '', styleCode: '', spokeSkU: '', supplierSku: '',
      supplier: 'AS Colour', description: '', shortDescription: '', size: '',
      colour: '', category: '', gender: '', cost: 0, t1Price: 0, t2Price: 0,
      t3Price: 0, imageUrls: [], composition: '', qty: 1, logoCount: 0, name: '',
      ...item.product_snapshot,
    } as NormalisedProduct,
  }));

  const html = generateQuoteHTML(config, lineItems);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(html);
}
