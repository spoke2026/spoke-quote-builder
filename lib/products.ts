// ─── Product utilities ────────────────────────────────────────────────────────

export interface NormalisedProduct {
  id: string;
  stockCode: string;
  styleCode: string;
  spokeSkU: string;
  supplierSku: string;
  supplier: string;
  name: string;
  description: string;
  shortDescription: string;
  size: string;
  colour: string;
  category: string;
  gender: string;
  composition: string;
  cost: number;
  t1Price: number;
  t2Price: number;
  t3Price: number;
  imageUrls: string[];
  qty: number;
  logoCount: number;
}

export type PricingTier = 'T1' | 'T2' | 'T3';

export function parseMoney(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
}

export function formatMoney(value: number): string {
  return '$' + value.toFixed(2);
}

export function getPrice(product: NormalisedProduct, tier: PricingTier): number {
  switch (tier) {
    case 'T2': return product.t2Price || product.t1Price;
    case 'T3': return product.t3Price || product.t1Price;
    default:   return product.t1Price;
  }
}

export function cleanImageUrl(url: string): string {
  url = String(url ?? '').trim();
  if (!url) return '';
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  const driveIdMatch = url.match(/[?&]id=([^&]+)/);
  if (url.includes('drive.google.com') && driveIdMatch) return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
  return url;
}

export function normaliseHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
export function mapStockItemRow(row: Record<string, string>, index: number): NormalisedProduct {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    return '';
  };

  const imageUrls = [
    get('imageFrontURL', 'imageURL_standard', 'imageURL_zoom'),
    get('imageSideURL'),
    get('imageBackURL'),
  ].map(cleanImageUrl).filter(Boolean);

  const uniqueImages = imageUrls.filter((img, idx) => imageUrls.indexOf(img) === idx);
  const stockCode = get('stockCode');
  const styleCode = get('styleCode');

  return {
    id: stockCode || `as-colour-${index}`,
    stockCode,
    styleCode,
    spokeSkU: '',
    supplierSku: styleCode || stockCode,
    supplier: 'AS Colour',
    name: get('styleName', 'name'),
    description: get('description'),
    shortDescription: get('shortDescription'),
    size: get('sizeCode'),
    colour: get('colour'),
    category: get('productType'),
    gender: '',
    composition: get('composition'),
    cost: 0,
    t1Price: parseMoney(get('priceExTax')),
    t2Price: 0,
    t3Price: 0,
    imageUrls: uniqueImages,
    qty: 1,
    logoCount: 1,
  };
}

export function mapASColourRow(row: Record<string, string>, index: number): NormalisedProduct {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
      const norm = normaliseHeader(k);
      const found = Object.keys(row).find(rk => normaliseHeader(rk) === norm);
      if (found && row[found] !== '') return row[found];
    }
    return '';
  };

  const imageRaw = get('imageURL', 'image_url', 'image_urls', 'imageUrls', 'image');
  const images = String(imageRaw ?? '').split(/[\|\n;]/).map(u => cleanImageUrl(u.trim())).filter(Boolean);
  const stockCode = get('stockCode', 'stock_code', 'sku', 'code');
  const styleCode = get('styleCode', 'style_code');

  return {
    id: stockCode || `as-colour-${index}`,
    stockCode,
    styleCode,
    spokeSkU: '',
    supplierSku: styleCode || stockCode,
    supplier: 'AS Colour',
    name: get('name', 'product_name', 'description'),
    description: '',
    shortDescription: '',
    size: get('size', 'sizes'),
    colour: get('colour', 'color', 'colour_name'),
    category: get('category', 'range'),
    gender: '',
    composition: '',
    cost: 0,
    t1Price: parseMoney(get('price', 't1_price', 't1price')),
    t2Price: 0,
    t3Price: 0,
    imageUrls: images,
    qty: 1,
    logoCount: 1,
  };
}

export function searchProducts(products: NormalisedProduct[], query: string): NormalisedProduct[] {
  if (!query.trim()) return products;
  const q = query.toLowerCase();
  return products.filter(p =>
    [p.name, p.stockCode, p.spokeSkU, p.supplierSku, p.colour, p.category, p.supplier]
      .join(' ').toLowerCase().includes(q)
  );
}