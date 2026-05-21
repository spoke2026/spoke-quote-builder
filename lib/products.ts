// ─── Product utilities ────────────────────────────────────────────────────────

export interface RawASColourRow {
  stockCode: string;
  styleCode: string;
  name: string;
  price: string;
  colour: string;
  imageURL: string;
}

export interface MasterDataRow {
  'Supplier SKU': string;
  'Spoke SKU': string;
  Supplier: string;
  Description: string;
  Size: string;
  Colour: string;
  Category: string;
  Gender: string;
  Cost: string;
  'T1 Price': string;
  'T1 GP%': string;
  'T2 Price': string;
  'T2 GP%': string;
  'T3 Price': string;
  'T3 GP%': string;
}

export interface NormalisedProduct {
  id: string;           // supplier_sku or fallback
  stockCode: string;
  styleCode: string;
  spokeSkU: string;
  supplierSku: string;
  supplier: string;
  name: string;
  description: string;
  size: string;
  colour: string;
  category: string;
  gender: string;
  cost: number;
  t1Price: number;
  t2Price: number;
  t3Price: number;
  imageUrls: string[];
  // For the quote builder
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
    case 'T2': return product.t2Price;
    case 'T3': return product.t3Price;
    default:   return product.t1Price;
  }
}

// ─── Clean Google Drive / image URLs ─────────────────────────────────────────

export function cleanImageUrl(url: string): string {
  url = String(url ?? '').trim();
  if (!url) return '';

  // https://drive.google.com/file/d/FILE_ID/view → direct embed
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }

  const driveIdMatch = url.match(/[?&]id=([^&]+)/);
  if (url.includes('drive.google.com') && driveIdMatch) {
    return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
  }

  return url;
}

export function parseImageUrls(value: string): string[] {
  return String(value ?? '')
    .split(/[\|\n;]/)
    .map((u) => cleanImageUrl(u.trim()))
    .filter(Boolean);
}

// ─── Normalise a header string ────────────────────────────────────────────────

export function normaliseHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ─── Parse AS Colour CSV rows into NormalisedProduct ─────────────────────────

export function mapASColourRow(row: Record<string, string>, index: number): NormalisedProduct {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
      const norm = normaliseHeader(k);
      const found = Object.keys(row).find(
        (rk) => normaliseHeader(rk) === norm
      );
      if (found && row[found] !== '') return row[found];
    }
    return '';
  };

  const imageRaw = get('imageURL', 'image_url', 'image_urls', 'imageUrls', 'image');
  const images = parseImageUrls(imageRaw);

  const stockCode = get('stockCode', 'stock_code', 'sku', 'code');
  const styleCode = get('styleCode', 'style_code');
  const name = get('name', 'product_name', 'description');
  const colour = get('colour', 'color', 'colour_name');

  return {
    id: stockCode || `as-colour-${index}`,
    stockCode,
    styleCode,
    spokeSkU: '',
    supplierSku: stockCode,
    supplier: 'AS Colour',
    name,
    description: '',
    size: get('size', 'sizes'),
    colour,
    category: get('category', 'range'),
    gender: '',
    cost: 0,
    t1Price: parseMoney(get('price', 't1_price', 't1price')),
    t2Price: 0,
    t3Price: 0,
    imageUrls: images,
    qty: 1,
    logoCount: 1,
  };
}

// ─── Merge Master Data pricing into AS Colour products ───────────────────────

export function mergeMasterData(
  products: NormalisedProduct[],
  masterRows: MasterDataRow[]
): NormalisedProduct[] {
  const masterBySupplierSku = new Map<string, MasterDataRow>();
  masterRows.forEach((row) => {
    const key = String(row['Supplier SKU'] ?? '').trim().toLowerCase();
    if (key) masterBySupplierSku.set(key, row);
  });

  return products.map((p) => {
    const key = p.supplierSku.toLowerCase();
    const master = masterBySupplierSku.get(key);
    if (!master) return p;

    return {
      ...p,
      spokeSkU: master['Spoke SKU'] ?? p.spokeSkU,
      supplier: master['Supplier'] ?? p.supplier,
      name: master['Description'] ?? p.name,
      size: master['Size'] ?? p.size,
      colour: master['Colour'] ?? p.colour,
      category: master['Category'] ?? p.category,
      gender: master['Gender'] ?? p.gender,
      cost: parseMoney(master['Cost']),
      t1Price: parseMoney(master['T1 Price']) || p.t1Price,
      t2Price: parseMoney(master['T2 Price']),
      t3Price: parseMoney(master['T3 Price']),
    };
  });
}

// ─── Search products (simple full-text) ──────────────────────────────────────

export function searchProducts(
  products: NormalisedProduct[],
  query: string
): NormalisedProduct[] {
  if (!query.trim()) return products;
  const q = query.toLowerCase();
  return products.filter((p) =>
    [p.name, p.stockCode, p.spokeSkU, p.supplierSku, p.colour, p.category, p.supplier]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
}
