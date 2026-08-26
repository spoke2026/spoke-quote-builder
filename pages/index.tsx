import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { uploadImage, MAX_EDGE_HERO, MAX_EDGE_LOGO } from '@/lib/uploads';
const ProductFromUrlModal = dynamic(() => import('@/components/ProductFromUrlModal'), { ssr: false });
const EditProductModal = dynamic(() => import('@/components/EditProductModal'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  stock_code: string;
  supplier_sku: string;
  spoke_sku: string;
  supplier: string;
  name: string;
  description: string;
  size: string;
  colour: string;
  category: string;
  t1_price: number;
  t2_price: number;
  t3_price: number;
  indent_price: number;
  features: string[];
  image_urls: string[];
  display_price?: number;
}

interface LogoPosition {
  id: string;
  position: string;
  price: number;
}

interface LineItem {
  product: Product;
  qty: number;
  logos: LogoPosition[];
  category: string;
  priceOverride: string;
}

type Tier = 'T1' | 'T2' | 'T3' | 'Indent';
type OutputType = 'quote' | 'pricelist';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPrice(p: Product, tier: Tier): number {
  if (tier === 'T2') return p.t2_price ?? p.t1_price ?? 0;
  if (tier === 'T3') return p.t3_price ?? p.t1_price ?? 0;
  if (tier === 'Indent') return p.indent_price ?? p.t1_price ?? 0;
  return p.t1_price ?? 0;
}

function overrideAmount(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (cleaned === '.' || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (isNaN(n) || n < 0) return null;
  return n;
}

function unitPrice(li: LineItem, tier: Tier): number {
  return overrideAmount(li.priceOverride) ?? getPrice(li.product, tier);
}

function fmt(n: number): string {
  return '$' + Number(n ?? 0).toFixed(2);
}

function parseMoney(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function placeholderImg(): string {
  if (typeof window === 'undefined') return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#EDEDE1"/><text x="100" y="115" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#40514F">No image</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function thumbnailSrc(product: Product): string {
  return product.image_urls?.[0] ?? placeholderImg();
}

function lineItemTotal(li: LineItem, tier: Tier): number {
  const unit = unitPrice(li, tier);
  const logoTotal = li.logos.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
  return (Number(li.qty) || 0) * (unit + logoTotal);
}

function newLogoPosition(): LogoPosition {
  return { id: Math.random().toString(36).slice(2), position: '', price: 0 };
}

export default function QuoteBuilder() {
  const [outputType, setOutputType] = useState<OutputType>('quote');
  const [customerName, setCustomerName] = useState('Customer Name');
  const [title, setTitle] = useState('Fit for work');
  const [introHeadline, setIntroHeadline] = useState('Better gear, clearer choices, quicker decisions.');
  const [introCopy, setIntroCopy] = useState('A workwear quote built from your Spoke product database.');
  const [contactEmail, setContactEmail] = useState('sales@spoke.nz');
  const [contactPhone, setContactPhone] = useState('021 220 1014');
  const [tier, setTier] = useState<Tier>('T1');
  const [setupFee, setSetupFee] = useState('Quoted per new logo');
  const [customerLogo, setCustomerLogo] = useState<string>('');
  const [heroImage, setHeroImage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'selected' | 'settings' | 'quotes'>('products');
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const categoryOrder = useMemo(
  () => Array.from(new Set(lineItems.map(li => li.category.trim() || '(uncategorised)'))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lineItems.length]
);

  useEffect(() => {
    fetch('/api/quotes?limit=30')
      .then(r => r.json())
      .then(d => setSavedQuotes(d.quotes ?? []))
      .catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&tier=${tier}&limit=80`);
      const data = await res.json();
      setSearchResults(data.products ?? []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [tier]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, doSearch]);

  useEffect(() => { doSearch(''); }, [doSearch]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (d: string) => void, label: string, maxEdge: number) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg(`Uploading ${label}…`);
    try {
      setter(await uploadImage(file, 'quote', { maxEdge }));
      setUploadMsg('');
    } catch (err: unknown) {
      setUploadMsg(err instanceof Error ? err.message : "That image didn't upload. Try again.");
    }
  }

  function addProduct(product: Product) {
    setLineItems(prev => {
      if (prev.some(li => li.product.id === product.id)) return prev;
      return [...prev, { product, qty: 1, logos: [], category: '', priceOverride: '' }];
    });
    setActiveTab('selected');
  }

  function removeItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setLineItems(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function addLogo(itemIdx: number) {
    setLineItems(prev => prev.map((li, i) =>
      i === itemIdx ? { ...li, logos: [...li.logos, newLogoPosition()] } : li
    ));
  }

  function removeLogo(itemIdx: number, logoId: string) {
    setLineItems(prev => prev.map((li, i) =>
      i === itemIdx ? { ...li, logos: li.logos.filter(l => l.id !== logoId) } : li
    ));
  }

  function updateLogo(itemIdx: number, logoId: string, field: 'position' | 'price', value: string | number) {
    setLineItems(prev => prev.map((li, i) =>
      i === itemIdx ? {
        ...li,
        logos: li.logos.map(l => l.id === logoId ? { ...l, [field]: value } : l)
      } : li
    ));
  }

  const totals = (() => {
    let prodSub = 0, logoSub = 0;
    lineItems.forEach(li => {
      prodSub += (Number(li.qty) || 0) * unitPrice(li, tier);
      const logos = Array.isArray(li.logos) ? li.logos : [];
      logoSub += (Number(li.qty) || 0) * logos.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
    });
    const grand = prodSub + logoSub;
    return { prodSub, logoSub, grand, gst: grand * 0.15, incl: grand * 1.15 };
  })();

  async function saveQuote() {
  const missing = lineItems.some(li => !li.category.trim());
  if (missing) {
    alert('All products must have a category assigned before saving.');
    return;
  }
  setSaving(true);
  setShareLink('');
  try {
      const body = {
        title, customer_name: customerName, intro_headline: introHeadline,
        intro_copy: introCopy, contact_email: contactEmail, contact_phone: contactPhone,
        output_type: outputType, pricing_tier: tier, logo_unit_price: 0,
        setup_fee: setupFee, created_by: 'sales',
        customer_logo_data_url: customerLogo ?? null,
        hero_image_data_url: heroImage ?? null,
        line_items: lineItems.map(li => ({
  qty: li.qty,
  logos: li.logos,
  category: li.category,
          unit_price: unitPrice(li, tier),
          unit_price_override: overrideAmount(li.priceOverride),
          line_total: lineItemTotal(li, tier),
          product_snapshot: {
            id: li.product.id, stockCode: li.product.stock_code,
            spokeSkU: li.product.spoke_sku, supplierSku: li.product.supplier_sku,
            supplier: li.product.supplier, name: li.product.name,
            description: li.product.description, size: li.product.size,
            colour: li.product.colour, category: li.product.category,
            t1Price: li.product.t1_price, t2Price: li.product.t2_price,
            t3Price: li.product.t3_price, indentPrice: li.product.indent_price,
            features: (li.product as unknown as { features?: string[] }).features ?? [],
            imageUrls: li.product.image_urls,
          },
        })),
      };

      let url = '/api/quotes';
      let method = 'POST';
      if (currentQuoteId) { url = `/api/quotes?id=${currentQuoteId}`; method = 'PUT'; }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = await res.text();
      let data: Record<string, string> = {};
      try { data = JSON.parse(text); } catch { throw new Error('Server error: ' + text.slice(0, 200)); }
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      if (!currentQuoteId && data.id) setCurrentQuoteId(data.id);

      const token = data.share_token ?? savedQuotes.find(q => q.id === currentQuoteId)?.share_token;
      if (token) setShareLink(`${window.location.origin}/api/quotes/share/${token}`);

      const listRes = await fetch('/api/quotes?limit=30');
      const listData = await listRes.json();
      setSavedQuotes(listData.quotes ?? []);
    } catch (err: unknown) {
      alert('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally { setSaving(false); }
  }

  async function downloadHTML() {
    if (shareLink) { window.open(shareLink, '_blank'); return; }
    alert('Save the quote first to get a download link.');
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncMsg('Reading CSV...');
    try {
      const text = await file.text();
      const Papa = (await import('papaparse')).default;
      const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
      if (!data.length) { setSyncMsg('Error: No rows found in CSV'); return; }
      setSyncMsg(`Parsed ${data.length} rows, uploading...`);
      const chunkSize = 200;
      let totalSynced = 0;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        setSyncMsg(`Uploading rows ${i + 1}–${Math.min(i + chunkSize, data.length)} of ${data.length}...`);
        const res = await fetch('/api/products/sync-csv', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, isFirst: i === 0 }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        totalSynced = result.total ?? (i + chunk.length);
      }
      setSyncMsg(`✓ Synced ${totalSynced} products`);
      doSearch(searchQuery);
    } catch (err: unknown) {
      setSyncMsg('Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <>
      <Head>
        <title>Spoke Quote Builder</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,100..1000&display=swap" rel="stylesheet" />
      </Head>
      <div className="app">
        <header className="app-header spoke-on-mineral">
          <img src="/spoke-logo-landscape-white.png" alt="Spoke" className="app-header-logo" />
          <span className="app-header-name">Quote Builder</span>
          <button type="button" className="signout-btn" onClick={handleSignOut}>Sign out</button>
        </header>

        <div className="workspace">
        <aside className="panel">
          <div className="tab-bar">
            {(['products', 'selected', 'settings', 'quotes'] as const).map(tab => (
              <button key={tab} className={`tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'selected' ? `Selected (${lineItems.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Products Tab ── */}
          {activeTab === 'products' && (
            <div className="tab-content">
              <div className="search-box">
                <input className="search-input" type="search" placeholder="Search by name, SKU, colour, category…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {searching && <span className="search-spinner">⟳</span>}
              </div>
              <div className="product-list">
                {searchResults.length === 0 && !searching && (
                  <p className="hint">No products found. Upload a CSV to sync the product database.</p>
                )}
                {searchResults.map(p => (
                  <div key={p.id} className="product-row">
                    <img className="product-thumb" src={thumbnailSrc(p)} alt={p.name}
                      onError={e => { (e.target as HTMLImageElement).src = placeholderImg(); }} />
                    <div className="product-info">
                      <div className="product-name">{p.name}</div>
                      <div className="product-meta">{p.spoke_sku || p.supplier_sku}{p.colour ? ` · ${p.colour}` : ''}{p.size ? ` · ${p.size}` : ''}</div>
                      <div className="product-price">{fmt(getPrice(p, tier))}</div>
                    </div>
                    <div className="product-row-actions">
                      <button className="add-btn" onClick={() => addProduct(p)} title="Add to quote">+</button>
                      <button className="edit-btn" onClick={() => setEditProduct(p)} title="Edit product">✎</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="sync-section">
                <label className="sync-label">Sync AS Colour CSV</label>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVUpload} />
                {syncMsg && <p className={`hint ${syncMsg.startsWith('✓') ? 'is-success' : 'is-error'}`}>{syncMsg}</p>}
              </div>
              <div className="sync-section" style={{ marginTop: '12px' }}>
                <label className="sync-label">Sync Pricing from Google Sheets</label>
                <button className="btn-secondary btn-compact"
                  onClick={async () => {
                    setSyncMsg('Syncing pricing from Google Sheets…');
                    try {
                      const res = await fetch('/api/products/sync-master-data', { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setSyncMsg(`✓ Synced pricing for ${data.upserted} products`);
                      doSearch(searchQuery);
                    } catch (err: unknown) {
                      setSyncMsg('Error: ' + (err instanceof Error ? err.message : String(err)));
                    }
                  }}>
                  Sync from Google Sheets
                </button>
              </div>
              <div className="sync-section" style={{ marginTop: '12px' }}>
                <label className="sync-label">Add product from URL</label>
                <button className="btn-secondary btn-compact"
                  onClick={() => setShowUrlModal(true)}>
                  + Add from URL
                </button>
              </div>
            </div>
          )}

         {/* ── Selected Tab ── */}
          {activeTab === 'selected' && (
            <div className="tab-content">
              {lineItems.length === 0 && (
                <p className="hint">No products selected yet. Search and add products from the Products tab.</p>
              )}
              <div className="selected-list">
                {lineItems.map((li, idx) => (
                  <div key={li.product.id} className="selected-item">
                    <img className="selected-thumb" src={thumbnailSrc(li.product)} alt={li.product.name}
                      onError={e => { (e.target as HTMLImageElement).src = placeholderImg(); }} />
                    <div className="selected-info">
                      <div className="product-name">{li.product.name}</div>
                      <div className="product-meta">{li.product.spoke_sku || li.product.supplier_sku} · {tier} {fmt(getPrice(li.product, tier))}</div>
                      <div className="qty-row">
                        <label>Qty
                          <input type="number" min="1" value={li.qty}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val > 0) {
                                setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, qty: val } : item));
                              }
                            }}
                          />
                        </label>
                        <label>Unit price
                          <span className="price-override-wrap">
                            <span className="price-override-prefix">$</span>
                            <input className="price-override-input" type="text" inputMode="decimal"
                              placeholder={getPrice(li.product, tier).toFixed(2)}
                              aria-label={`Unit price for ${li.product.name}, leave empty to use the ${tier} price`}
                              value={li.priceOverride}
                              onChange={e => {
                                const val = e.target.value;
                                setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, priceOverride: val } : item));
                              }}
                            />
                          </span>
                        </label>
                        <span className="line-total">{fmt(lineItemTotal(li, tier))}</span>
                      </div>
                      {li.priceOverride.trim() !== '' && (
                        <p className="override-note">
                          {overrideAmount(li.priceOverride) === null
                            ? `Enter a price of 0 or more, or clear the field to use the ${tier} price.`
                            : `Custom price. ${tier} price is ${fmt(getPrice(li.product, tier))}.`}
                          <button className="link-btn"
                            onClick={() => setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, priceOverride: '' } : item))}>
                            Use {tier} price
                          </button>
                        </p>
                      )}
                      <label className="category-field">
                        Category
                        <input
                          placeholder="e.g. Hand Protection"
                          value={li.category}
                          onChange={e => {
                            const val = e.target.value;
                            setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, category: val } : item));
                          }}
                        />
                      </label>
                      {li.logos.length > 0 && (
                        <div className="logo-positions">
                          {li.logos.map(logo => (
                            <div key={logo.id} className="logo-row">
                              <input className="logo-position-input" placeholder="Position (e.g. Chest)"
                                value={logo.position}
                                onChange={e => updateLogo(idx, logo.id, 'position', e.target.value)}
                              />
                              <div className="logo-price-wrap">
                                <span className="logo-price-prefix">$</span>
                                <input className="logo-price-input" type="number" min="0" step="0.50" placeholder="0.00"
                                  value={logo.price || ''}
                                  onChange={e => updateLogo(idx, logo.id, 'price', parseMoney(e.target.value))}
                                />
                              </div>
                              <button className="icon-btn danger" onClick={() => removeLogo(idx, logo.id)}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button className="add-logo-btn" onClick={() => addLogo(idx)}>+ Add logo position</button>
                    </div>
                    <div className="item-actions">
                      <button className="icon-btn" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>↑</button>
                      <button className="icon-btn" onClick={() => moveItem(idx, 1)} disabled={idx === lineItems.length - 1}>↓</button>
                      <button className="icon-btn danger" onClick={() => removeItem(idx)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              {lineItems.length > 0 && (
                <div className="totals-box">
                  <div className="total-row"><span>Products</span><span>{fmt(totals.prodSub)}</span></div>
                  <div className="total-row"><span>Logos</span><span>{fmt(totals.logoSub)}</span></div>
                  <div className="total-row"><span>Excl GST</span><span>{fmt(totals.grand)}</span></div>
                  <div className="total-row"><span>GST 15%</span><span>{fmt(totals.gst)}</span></div>
                  <div className="total-row grand"><span>Total incl GST</span><span>{fmt(totals.incl)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* ── Settings Tab ── */}
          {activeTab === 'settings' && (
            <div className="tab-content">
              <div className="settings-grid">
                <label>Output type
                  <select value={outputType} onChange={e => setOutputType(e.target.value as OutputType)}>
                    <option value="quote">Quote</option>
                    <option value="pricelist">Price List</option>
                  </select>
                </label>
                <label>Pricing tier
                  <select value={tier} onChange={e => setTier(e.target.value as Tier)}>
                    <option value="T1">T1 (Standard)</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                                                     <option value="Indent">Indent</option>
                                          </select>
                </label>
                <label>Customer name<input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
                <label>Quote title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
                <label>Intro headline<input value={introHeadline} onChange={e => setIntroHeadline(e.target.value)} /></label>
                <label>Intro copy<textarea value={introCopy} onChange={e => setIntroCopy(e.target.value)} rows={3} /></label>
                <label>Contact email<input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></label>
                <label>Contact phone<input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></label>
                <label>Setup fee text<input value={setupFee} onChange={e => setSetupFee(e.target.value)} /></label>
                <label>Customer logo
                  <input type="file" accept="image/*" onChange={e => handleFileUpload(e, setCustomerLogo, 'customer logo', MAX_EDGE_LOGO)} />
                  {customerLogo && <img src={customerLogo} alt="logo preview" className="file-preview" />}
                </label>
                <label>Hero image
                  <input type="file" accept="image/*" onChange={e => handleFileUpload(e, setHeroImage, 'hero image', MAX_EDGE_HERO)} />
                  {heroImage && <img src={heroImage} alt="hero preview" className="file-preview" />}
                </label>
                {uploadMsg && (
                  <p className={`hint ${uploadMsg.startsWith('Uploading') ? '' : 'is-error'}`}>{uploadMsg}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Quotes Tab ── */}
          {activeTab === 'quotes' && (
            <div className="tab-content">
              <p className="hint">Click a quote to load it into the builder.</p>
              <div className="quote-list">
                {savedQuotes.length === 0 && <p className="hint">No saved quotes found.</p>}
                {savedQuotes.map(q => (
                  <div key={q.id} className="quote-card"
                    onClick={async () => {
                      const res = await fetch(`/api/quotes?id=${q.id}`);
                      const data = await res.json();
                      const quote = data.quote;
                      if (!quote) return;
                      setCurrentQuoteId(quote.id);
                      setTitle(quote.title ?? '');
                      setCustomerName(quote.customer_name ?? '');
                      setIntroHeadline(quote.intro_headline ?? '');
                      setIntroCopy(quote.intro_copy ?? '');
                      setContactEmail(quote.contact_email ?? '');
                      setContactPhone(quote.contact_phone ?? '');
                      setOutputType(quote.output_type ?? 'quote');
                      setTier(quote.pricing_tier ?? 'T1');
                      setSetupFee(quote.setup_fee ?? '');
                      setCustomerLogo(quote.customer_logo_data_url ?? '');
                      setHeroImage(quote.hero_image_data_url ?? '');
                      setLineItems((quote.line_items ?? []).map((li: any) => {
                        const s = li.product_snapshot;
                        return {
                          qty: Number(li.qty) || 1,
logos: li.logos ?? [],
category: li.category ?? '',
priceOverride: li.unit_price_override === null || li.unit_price_override === undefined
  ? ''
  : String(li.unit_price_override),
product: {
                            ...s,
                            t1_price: s.t1_price ?? s.t1Price ?? 0,
                            t2_price: s.t2_price ?? s.t2Price ?? 0,
                            t3_price: s.t3_price ?? s.t3Price ?? 0,
                                                                           indent_price: s.indent_price ?? s.indentPrice ?? 0,
                            stock_code: s.stock_code ?? s.stockCode ?? '',
                            spoke_sku: s.spoke_sku ?? s.spokeSkU ?? '',
                            supplier_sku: s.supplier_sku ?? s.supplierSku ?? '',
                            image_urls: s.image_urls ?? s.imageUrls ?? [],
                          },
                        };
                      }));
                      setShareLink(`${window.location.origin}/api/quotes/share/${quote.share_token}`);
                      setActiveTab('selected');
                    }}>
                    <div className="quote-card-row">
  <div>
    <div className="quote-card-name">{q.customer_name || 'Unnamed'} — {q.title}</div>
    <div className="quote-card-meta">{q.output_type} · {q.pricing_tier} · {new Date(q.updated_at).toLocaleDateString()}</div>
  </div>
  <button
    className="btn-danger"
    onClick={async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${q.customer_name || 'Unnamed'} — ${q.title}"?`)) return;
      await fetch(`/api/quotes?id=${q.id}`, { method: 'DELETE' });
      setSavedQuotes(prev => prev.filter(x => x.id !== q.id));
      if (currentQuoteId === q.id) {
        setCurrentQuoteId(null);
        setShareLink('');
        setLineItems([]);
      }
    }}>
    Delete
  </button>
</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          {/* ── Actions ── */}
          <div className="panel-actions">
            <div className="panel-actions-row">
              <button className="btn-primary" onClick={saveQuote} disabled={saving}>
                {saving ? 'Saving…' : currentQuoteId ? 'Update quote' : 'Save quote'}
              </button>
              {currentQuoteId && (
                <button className="btn-secondary"
                  onClick={() => {
                    setCurrentQuoteId(null);
                    setShareLink('');
                    setTitle('Fit for work');
                    setCustomerName('');
                    setIntroHeadline('Better gear, clearer choices, quicker decisions.');
                    setIntroCopy('A workwear quote built from your Spoke product database.');
                    setContactEmail('sales@spoke.nz');
                    setContactPhone('021 220 1014');
                    setOutputType('quote');
                    setTier('T1');
                    setSetupFee('Quoted per new logo');
                    setLineItems([]);
                    setCustomerLogo('');
                    setHeroImage('');
                  }}>
                  + New quote
                </button>
              )}
            </div>
            {shareLink && (
              <div className="share-box">
                <span className="share-label">Share link:</span>
                <input className="share-input" readOnly value={shareLink} onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="btn-copy" onClick={() => navigator.clipboard.writeText(shareLink)}>Copy</button>
              </div>
            )}
          </div>

          {savedQuotes.length > 0 && (
            <div className="saved-section">
              <div className="saved-label">Recent quotes</div>
              <div className="saved-list">
                {savedQuotes.slice(0, 10).map(q => (
                  <div key={q.id} className={`saved-item${q.id === currentQuoteId ? ' active' : ''}`}
                    onClick={() => {
                      setCurrentQuoteId(q.id);
                      setShareLink(`${window.location.origin}/api/quotes/share/${q.share_token}`);
                    }}>
                    <div className="saved-item-name">{q.customer_name} — {q.title}</div>
                    <div className="saved-item-date">{new Date(q.updated_at).toLocaleDateString('en-NZ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Preview Pane ── */}
        <section className="preview-pane">
          <div className="preview-toolbar">
            <div className="preview-title">Live Preview</div>
            <div className="preview-actions">
              <button className="btn-secondary" onClick={() => window.open(shareLink || '', '_blank')} disabled={!shareLink}>Open share link</button>
              <button className="btn-secondary" onClick={downloadHTML}>Download HTML</button>
            </div>
          </div>

          {lineItems.length === 0 ? (
            <div className="preview-empty">
              <h2>Start building a quote</h2>
              <p>Search for products in the left panel and add them to your quote.</p>
            </div>
          ) : (
            <div className="preview-content">
              <div className="preview-header">
                <div className="preview-meta"><strong>{customerName}</strong> · {title} · {tier} pricing</div>
              </div>
              <div className="preview-cards">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="preview-card">
                    <div className="preview-card-img">
                      <img src={thumbnailSrc(li.product)} alt={li.product.name}
                        onError={e => { (e.target as HTMLImageElement).src = placeholderImg(); }} />
                    </div>
                    <div className="preview-card-body">
                      <div className="preview-card-num">Option {idx + 1}</div>
                      <div className="preview-card-name">{li.product.name}</div>
                      <div className="preview-card-detail">{li.product.colour} · {li.product.size}</div>
                      {li.logos.length > 0 && (
                        <div className="preview-logos">
                          {li.logos.map(l => (
                            <div key={l.id} className="preview-logo-item">
                              {l.position || 'Logo'} {l.price > 0 ? `· ${fmt(l.price)}/unit` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="preview-card-price">
                        <span>{fmt(getPrice(li.product, tier))} / unit</span>
                        <span className="preview-card-total">{fmt(lineItemTotal(li, tier))} total</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="preview-totals">
                <table>
                  <tbody>
                    <tr><td>Products subtotal</td><td>{fmt(totals.prodSub)}</td></tr>
                    <tr><td>Logo subtotal</td><td>{fmt(totals.logoSub)}</td></tr>
                    <tr><td>Total excl GST</td><td>{fmt(totals.grand)}</td></tr>
                    <tr><td>GST 15%</td><td>{fmt(totals.gst)}</td></tr>
                    <tr className="grand"><td>Total incl GST</td><td>{fmt(totals.incl)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="preview-note">Save the quote to get a shareable link.</p>
            </div>
          )}
        </section>
        </div>
      </div>

      {showUrlModal && (
        <ProductFromUrlModal
          onClose={() => setShowUrlModal(false)}
          onSaved={() => { doSearch(searchQuery); setSyncMsg('✓ Product saved!'); }}
        />
      )}
      {editProduct && (
        <EditProductModal
          product={editProduct as never}
          onClose={() => setEditProduct(null)}
          onSaved={() => { doSearch(searchQuery); setEditProduct(null); }}
        />
      )}
      <style jsx global>{`
        /* ── Shell ───────────────────────────────────────────────────────── */
        .app { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; background: var(--spoke-surface-0); }
        .app-header { min-height: 72px; background: var(--spoke-surface-2); color: var(--spoke-white); display: flex; align-items: center; gap: 20px; padding: 0 24px; }
        .app-header-logo { height: 30px; width: auto; display: block; }
        .app-header-name { font-size: 1rem; font-weight: 650; color: var(--spoke-white-68); }
        .signout-btn { margin-left: auto; background: none; border: 0; padding: 0; color: var(--spoke-white-68); font-size: .84rem; cursor: pointer; }
        .signout-btn:hover { color: var(--spoke-white-90); }
        .workspace { display: grid; grid-template-columns: 440px 1fr; min-height: 0; }

        /* ── Control panel (white surface on the Stone workspace) ────────── */
        .panel { background: var(--spoke-surface-1); border-right: 1px solid var(--spoke-mineral-18); display: flex; flex-direction: column; height: calc(100vh - 72px); position: sticky; top: 0; overflow: hidden; }
        .tab-bar { display: flex; border-bottom: 1px solid var(--spoke-mineral-18); flex-shrink: 0; padding: 0 24px; }
        .tab-btn { background: none; border: none; color: var(--spoke-mineral-80); font-size: .92rem; font-weight: 650; padding: 14px 14px 12px; cursor: pointer; border-bottom: 3px solid transparent; transition: color var(--spoke-transition-fast), border-color var(--spoke-transition-fast); margin-bottom: -1px; }
        .tab-btn:hover { color: var(--spoke-mineral-deep); }
        .tab-btn.active { color: var(--spoke-mineral-deep); border-bottom-color: var(--spoke-zest); }
        .tab-content { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; scrollbar-width: thin; scrollbar-color: var(--spoke-mineral-24) transparent; }

        /* ── Fields ──────────────────────────────────────────────────────── */
        .search-box { position: relative; }
        .search-input { width: 100%; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 10px 40px 10px 12px; font-size: .95rem; transition: border-color var(--spoke-transition); }
        .search-input:hover { border-color: var(--spoke-mineral-42); }
        .search-input::placeholder { color: var(--spoke-mineral-42); }
        .search-spinner { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--spoke-mineral-80); animation: spin 1s linear infinite; font-size: 16px; }
        @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

        /* ── Product list ────────────────────────────────────────────────── */
        .product-list { display: flex; flex-direction: column; flex: 1; min-height: 200px; max-height: 440px; overflow-y: auto; border-top: 1px solid var(--spoke-mineral-18); }
        .product-row { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--spoke-mineral-10); padding: 10px 4px; transition: background var(--spoke-transition-fast); }
        .product-row:hover { background: var(--spoke-mineral-10); }
        .product-thumb { width: 48px; height: 48px; object-fit: contain; background: var(--spoke-stone); flex-shrink: 0; }
        .product-info { flex: 1; min-width: 0; }
        .product-name { font-weight: 650; font-size: .92rem; color: var(--spoke-mineral-deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .product-meta { font-family: var(--spoke-data-font); font-size: .74rem; color: var(--spoke-mineral-80); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .product-price { font-family: var(--spoke-data-font); font-size: .86rem; font-weight: 500; color: var(--spoke-mineral-deep); margin-top: 3px; }
        .product-row-actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
        .add-btn { background: var(--spoke-zest); color: #28332F; border: none; border-radius: var(--spoke-radius); width: 44px; height: 44px; font-size: 20px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background var(--spoke-transition-fast); }
        .add-btn:hover { background: var(--spoke-zest-hover); }
        .edit-btn { background: none; color: var(--spoke-mineral-80); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); width: 44px; height: 28px; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color var(--spoke-transition-fast), color var(--spoke-transition-fast); }
        .edit-btn:hover { border-color: var(--spoke-mineral-42); color: var(--spoke-mineral-deep); }

        /* ── Sync sections ───────────────────────────────────────────────── */
        .sync-section { border-top: 1px solid var(--spoke-mineral-18); padding-top: 16px; }
        .sync-label { font-size: .78rem; font-weight: 650; color: var(--spoke-mineral-deep); display: block; margin-bottom: 8px; }
        .sync-section input[type="file"] { color: var(--spoke-mineral-80); font-size: .82rem; width: 100%; }

        /* ── Selected line items (Stone objects on the white panel) ──────── */
        .selected-list { display: flex; flex-direction: column; gap: 12px; }
        .selected-item { display: flex; gap: 12px; background: var(--spoke-stone); border: 1px solid var(--spoke-mineral-18); border-radius: var(--spoke-radius); padding: 14px; align-items: flex-start; }
        .selected-thumb { width: 48px; height: 48px; object-fit: contain; background: var(--spoke-white); flex-shrink: 0; margin-top: 2px; }
        .selected-info { flex: 1; min-width: 0; }
        .qty-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .qty-row label { font-size: .78rem; font-weight: 650; color: var(--spoke-mineral-deep); display: flex; flex-direction: column; gap: 4px; }
        .qty-row input[type="number"] { width: 68px; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 6px 8px; font-family: var(--spoke-data-font); font-size: .95rem; text-align: center; -moz-appearance: textfield; }
        .qty-row input[type="number"]::-webkit-inner-spin-button { display: none; }
        .line-total { font-family: var(--spoke-data-font); font-weight: 500; color: var(--spoke-mineral-deep); font-size: .95rem; margin-left: auto; white-space: nowrap; }
        .price-override-wrap { display: flex; align-items: center; gap: 6px; }
        .price-override-prefix { color: var(--spoke-mineral-80); font-size: .88rem; }
        .price-override-input { width: 86px; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 6px 8px; font-family: var(--spoke-data-font); font-size: .95rem; font-weight: 400; text-align: center; }
        .price-override-input::placeholder { color: var(--spoke-mineral-42); font-weight: 400; }
        .override-note { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; font-size: .78rem; color: var(--spoke-mineral-80); }
        .link-btn { background: none; border: none; padding: 0; font: inherit; font-weight: 650; color: var(--spoke-mineral-deep); text-decoration: underline; cursor: pointer; }
        .link-btn:hover { color: var(--spoke-mineral); }
        .category-field { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; font-size: .78rem; font-weight: 650; color: var(--spoke-mineral-deep); }
        .category-field input { width: 100%; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 8px 10px; font-size: .9rem; font-weight: 400; }
        .category-field input::placeholder { color: var(--spoke-mineral-42); }

        /* ── Logo positions ──────────────────────────────────────────────── */
        .logo-positions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--spoke-mineral-18); }
        .logo-row { display: flex; align-items: center; gap: 8px; }
        .logo-position-input { flex: 1; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 6px 10px; font-size: .88rem; min-width: 0; }
        .logo-position-input::placeholder { color: var(--spoke-mineral-42); }
        .logo-price-wrap { display: flex; align-items: center; gap: 6px; }
        .logo-price-prefix { color: var(--spoke-mineral-80); font-size: .88rem; }
        .logo-price-input { width: 68px; min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 6px; font-family: var(--spoke-data-font); font-size: .88rem; text-align: center; -moz-appearance: textfield; }
        .logo-price-input::-webkit-inner-spin-button { display: none; }
        .add-logo-btn { background: none; border: 1px solid var(--spoke-mineral-24); color: var(--spoke-mineral-deep); border-radius: var(--spoke-radius); min-height: var(--spoke-touch-min); padding: 8px 12px; font-size: .86rem; font-weight: 650; cursor: pointer; margin-top: 10px; width: 100%; text-align: left; transition: border-color var(--spoke-transition-fast), background var(--spoke-transition-fast); }
        .add-logo-btn:hover { border-color: var(--spoke-mineral-42); background: var(--spoke-mineral-10); }
        .item-actions { display: flex; flex-direction: column; gap: 6px; }
        .icon-btn { background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); color: var(--spoke-mineral-deep); border-radius: var(--spoke-radius); width: 36px; height: 36px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color var(--spoke-transition-fast), background var(--spoke-transition-fast); }
        .icon-btn:hover:not(:disabled) { border-color: var(--spoke-mineral-42); }
        .icon-btn.danger { color: var(--spoke-error); }
        .icon-btn:disabled { opacity: .35; cursor: not-allowed; }

        /* ── Totals ──────────────────────────────────────────────────────── */
        .totals-box { background: var(--spoke-stone); border: 1px solid var(--spoke-mineral-18); border-top: 3px solid var(--spoke-zest); border-radius: var(--spoke-radius); padding: 16px 18px; margin-top: 8px; }
        .total-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: .9rem; color: var(--spoke-mineral-deep); border-top: 1px solid var(--spoke-mineral-10); }
        .total-row:first-child { border-top: none; }
        .total-row span:last-child { font-family: var(--spoke-data-font); }
        .total-row.grand { font-weight: 700; font-size: 1.05rem; border-top: 1px solid var(--spoke-mineral-24); padding-top: 10px; margin-top: 4px; }

        /* ── Settings ────────────────────────────────────────────────────── */
        .settings-grid { display: flex; flex-direction: column; gap: 16px; }
        .settings-grid label { display: flex; flex-direction: column; gap: 6px; font-size: .78rem; font-weight: 650; color: var(--spoke-mineral-deep); }
        .settings-grid input, .settings-grid select, .settings-grid textarea { min-height: var(--spoke-touch-min); background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-deep); padding: 10px 12px; font-size: .95rem; font-weight: 400; width: 100%; transition: border-color var(--spoke-transition); }
        .settings-grid input:hover, .settings-grid select:hover, .settings-grid textarea:hover { border-color: var(--spoke-mineral-42); }
        .settings-grid input[type="file"] { border: 0; padding: 0; min-height: 0; font-size: .82rem; color: var(--spoke-mineral-80); }
        .settings-grid textarea { resize: vertical; min-height: 84px; }
        .file-preview { max-height: 56px; max-width: 140px; object-fit: contain; margin-top: 8px; background: var(--spoke-stone); padding: 6px; }

        /* ── Saved quotes list ───────────────────────────────────────────── */
        .quote-list { display: flex; flex-direction: column; gap: 8px; }
        .quote-card { background: var(--spoke-stone); border: 1px solid var(--spoke-mineral-18); border-radius: var(--spoke-radius); padding: 14px; cursor: pointer; transition: border-color var(--spoke-transition); }
        .quote-card:hover { border-color: var(--spoke-mineral-42); }
        .quote-card-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .quote-card-name { font-weight: 650; color: var(--spoke-mineral-deep); font-size: .92rem; }
        .quote-card-meta { font-size: .78rem; color: var(--spoke-mineral-80); margin-top: 4px; }

        /* ── Buttons ─────────────────────────────────────────────────────── */
        .panel-actions { padding: 16px 24px; border-top: 1px solid var(--spoke-mineral-18); flex-shrink: 0; }
        .panel-actions-row { display: flex; gap: 8px; }
        .btn-primary { background: var(--spoke-zest); color: #28332F; border: 1px solid transparent; border-radius: var(--spoke-radius); min-height: 52px; padding: 12px 20px; font-weight: 700; font-size: .95rem; cursor: pointer; width: 100%; transition: background var(--spoke-transition-fast); }
        .btn-primary:hover:not(:disabled) { background: var(--spoke-zest-hover); }
        .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .btn-secondary { background: transparent; border: 1px solid var(--spoke-mineral-42); color: var(--spoke-mineral-deep); border-radius: var(--spoke-radius); min-height: 52px; padding: 12px 20px; font-weight: 650; font-size: .95rem; cursor: pointer; width: 100%; white-space: nowrap; transition: background var(--spoke-transition-fast), border-color var(--spoke-transition-fast); }
        .btn-secondary:hover:not(:disabled) { background: var(--spoke-mineral-10); }
        .btn-secondary:disabled { opacity: .4; cursor: not-allowed; }
        .btn-compact { min-height: var(--spoke-touch-min); padding: 10px 16px; font-size: .88rem; }
        .btn-danger { background: transparent; border: 1px solid var(--spoke-error); color: var(--spoke-error); border-radius: var(--spoke-radius); min-height: 36px; padding: 6px 14px; font-size: .82rem; font-weight: 650; cursor: pointer; flex-shrink: 0; transition: background var(--spoke-transition-fast); }
        .btn-danger:hover { background: rgba(155, 74, 67, .08); }

        /* ── Share link ──────────────────────────────────────────────────── */
        .share-box { display: flex; gap: 8px; align-items: center; margin-top: 12px; background: var(--spoke-stone); padding: 10px; }
        .share-label { font-size: .78rem; color: var(--spoke-mineral-deep); white-space: nowrap; font-weight: 650; }
        .share-input { flex: 1; background: var(--spoke-white); border: 1px solid var(--spoke-mineral-24); border-radius: var(--spoke-radius); color: var(--spoke-mineral-80); padding: 8px 10px; font-family: var(--spoke-data-font); font-size: .74rem; min-width: 0; }
        .btn-copy { background: var(--spoke-white); border: 1px solid var(--spoke-mineral-42); color: var(--spoke-mineral-deep); border-radius: var(--spoke-radius); padding: 8px 14px; font-size: .82rem; font-weight: 650; cursor: pointer; white-space: nowrap; }
        .btn-copy:hover { background: var(--spoke-mineral-10); }

        /* ── Recent quotes ───────────────────────────────────────────────── */
        .saved-section { border-top: 1px solid var(--spoke-mineral-18); padding: 16px 24px; flex-shrink: 0; }
        .saved-label { font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--spoke-mineral-80); margin-bottom: 10px; }
        .saved-list { display: flex; flex-direction: column; max-height: 160px; overflow-y: auto; }
        .saved-item { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 10px; cursor: pointer; border-left: 3px solid transparent; transition: background var(--spoke-transition-fast); }
        .saved-item:hover { background: var(--spoke-mineral-10); }
        .saved-item.active { background: var(--spoke-mineral-10); border-left-color: var(--spoke-zest); }
        .saved-item-name { font-size: .86rem; color: var(--spoke-mineral-deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .saved-item-date { font-family: var(--spoke-data-font); font-size: .72rem; color: var(--spoke-mineral-80); flex-shrink: 0; }

        /* ── Preview pane ────────────────────────────────────────────────── */
        .preview-pane { display: flex; flex-direction: column; padding: 32px; overflow-y: auto; height: calc(100vh - 72px); background: var(--spoke-surface-0); }
        .preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
        .preview-title { font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--spoke-mineral-80); font-weight: 700; }
        .preview-actions { display: flex; gap: 8px; }
        .preview-actions .btn-secondary { width: auto; min-height: var(--spoke-touch-min); padding: 10px 16px; font-size: .88rem; }
        .preview-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 40px; color: var(--spoke-mineral-80); }
        .preview-empty h2 { color: var(--spoke-mineral-deep); font-size: 1.8rem; line-height: 1.08; letter-spacing: -.035em; font-weight: 650; margin: 0 0 12px; }
        .preview-empty p { margin: 0; max-width: var(--spoke-text-max); }
        .preview-content { display: flex; flex-direction: column; gap: 24px; }
        .preview-header { background: var(--spoke-surface-2); color: var(--spoke-white); padding: 18px 24px; display: flex; align-items: center; gap: 16px; }
        .preview-meta { font-size: .92rem; color: var(--spoke-white-78); }
        .preview-meta strong { color: var(--spoke-white); font-weight: 650; }
        .preview-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .preview-card { background: var(--spoke-surface-1); border: 1px solid var(--spoke-mineral-18); border-radius: var(--spoke-radius); overflow: hidden; display: flex; flex-direction: column; }
        .preview-card-img { background: var(--spoke-stone); height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .preview-card-img img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .preview-card-body { padding: 18px; display: flex; flex-direction: column; flex: 1; }
        .preview-card-num { font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--spoke-mineral-80); font-weight: 700; margin-bottom: 6px; }
        .preview-card-name { font-weight: 650; color: var(--spoke-mineral-deep); font-size: 1.15rem; line-height: 1.2; margin-bottom: 6px; }
        .preview-card-detail { font-size: .86rem; color: var(--spoke-mineral-80); margin-bottom: 12px; }
        .preview-logos { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        .preview-logo-item { font-size: .82rem; color: var(--spoke-mineral-deep); background: var(--spoke-stone); padding: 6px 10px; border-left: 3px solid var(--spoke-zest); }
        .preview-card-price { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: auto; font-family: var(--spoke-data-font); font-size: .82rem; color: var(--spoke-mineral-80); border-top: 1px solid var(--spoke-mineral-18); padding-top: 12px; }
        .preview-card-total { font-weight: 500; color: var(--spoke-mineral-deep); font-size: 1rem; }
        .preview-totals { background: var(--spoke-surface-1); border: 1px solid var(--spoke-mineral-18); border-top: 3px solid var(--spoke-zest); border-radius: var(--spoke-radius); padding: 24px; max-width: 420px; margin-left: auto; width: 100%; }
        .preview-totals table { width: 100%; border-collapse: collapse; }
        .preview-totals td { padding: 8px 0; font-size: .95rem; color: var(--spoke-mineral-deep); }
        .preview-totals td:last-child { text-align: right; font-family: var(--spoke-data-font); }
        .preview-totals tr.grand td { border-top: 1px solid var(--spoke-mineral-24); font-size: 1.15rem; font-weight: 700; padding-top: 14px; }
        .preview-note { font-size: .86rem; color: var(--spoke-mineral-80); text-align: center; padding-bottom: 20px; }

        /* ── Hints and status ────────────────────────────────────────────── */
        .hint { font-size: .86rem; color: var(--spoke-mineral-80); margin: 0; }
        .hint.is-success { color: var(--spoke-success); }
        .hint.is-error { color: var(--spoke-error); }

        @media (max-width: 900px) {
          .workspace { grid-template-columns: 1fr; }
          .panel { height: auto; position: relative; border-right: 0; border-bottom: 1px solid var(--spoke-mineral-18); }
          .preview-pane { height: auto; padding: 24px 20px; }
          .app-header { min-height: 62px; padding: 0 20px; gap: 14px; }
          .app-header-logo { height: 26px; }
        }
      `}</style>
    </>
  );
}