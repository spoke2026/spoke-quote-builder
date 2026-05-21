import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { generateQuoteHTML, QuoteConfig, QuoteLineItem } from '@/lib/quote';
import { NormalisedProduct } from '@/lib/products';
import fs from 'fs';
import path from 'path';

const SPOKE_LOGO_B64 = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">
    <rect width="120" height="40" fill="#40514F"/>
    <text x="10" y="28" font-family="Georgia,serif" font-size="22" font-style="italic" fill="#BEDA81">spoke</text>
  </svg>`
).toString('base64');

/**
 * POST /api/quotes/generate
 * Body: { quoteId, customerLogoDataUrl?, heroImageDataUrl? }
 * Returns: text/html
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { quoteId, customerLogoDataUrl, heroImageDataUrl } = req.body ?? {};

  if (!quoteId) return res.status(400).json({ error: 'quoteId required' });

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (error || !quote) {
    return res.status(404).json({ error: 'Quote not found' });
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
    logoUnitPrice:        Number(quote.logo_unit_price ?? 5),
    setupFee:             quote.setup_fee ?? 'Quoted per new logo',
    customerLogoDataUrl:  customerLogoDataUrl ?? undefined,
    heroImageDataUrl:     heroImageDataUrl ?? undefined,
  };

  const lineItems: QuoteLineItem[] = (quote.line_items ?? []).map((item: {
    qty: number;
    logo_count: number;
    product_snapshot: Partial<NormalisedProduct>;
  }) => ({
    qty:       item.qty ?? 1,
    logoCount: item.logo_count ?? 1,
    product:   {
      id: '', stockCode: '', styleCode: '', spokeSkU: '', supplierSku: '',
      supplier: 'AS Colour', description: '', size: '', colour: '',
      category: '', gender: '', cost: 0, t1Price: 0, t2Price: 0, t3Price: 0,
      imageUrls: [], qty: item.qty ?? 1, logoCount: item.logo_count ?? 1, name: '',
      ...item.product_snapshot,
    } as NormalisedProduct,
  }));

  const html = generateQuoteHTML(config, lineItems);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="spoke-quote-${quote.customer_name.toLowerCase().replace(/\s+/g,'-')}.html"`);
  return res.status(200).send(html);
}
