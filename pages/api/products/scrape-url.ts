import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!pageRes.ok) {
      return res.status(400).json({ error: `Could not fetch page: ${pageRes.statusText}` });
    }

    const html = await pageRes.text();

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const allImages: string[] = [];
const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
let imgMatch;
while ((imgMatch = imgRegex.exec(html)) !== null) {
  const src = imgMatch[1];
  if (src && !src.includes('data:') && !src.includes('logo') && !src.includes('icon') && !src.includes('banner')) {
    const fullUrl = src.startsWith('http') ? src : new URL(src, url).href;
    if (!allImages.includes(fullUrl)) allImages.push(fullUrl);
  }
}

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Extract product information from this webpage text. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "name": "product name",
  "supplierSku": "product code/SKU",
  "shortDescription": "one sentence tagline",
  "description": "2-3 sentence product description",
  "features": ["feature 1", "feature 2", "feature 3"],
  "sizes": "size range e.g. S-5XL or One Size",
  "colours": "available colours",
  "category": "product category",
  "supplier": "brand/supplier name",
  "composition": "materials/composition if mentioned"
}

Webpage text:
${text}`
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(500).json({ error: `Claude API error: ${errText}` });
    }

    const claudeData = await claudeRes.json();
    const claudeText = claudeData.content?.[0]?.text ?? '{}';

    let productData: Record<string, unknown> = {};
    try {
      productData = JSON.parse(claudeText.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'Could not parse product data from page' });
    }

    productData.imageUrls = allImages.slice(0, 8);
    productData.sourceUrl = url;

    return res.status(200).json({ product: productData });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('scrape-url error:', message);
    return res.status(500).json({ error: message });
  }
}