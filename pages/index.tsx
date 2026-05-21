import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

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
  image_urls: string[];
  display_price?: number;
}

interface LineItem {
  product: Product;
  qty: number;
  logoCount: number;
}

type Tier = 'T1' | 'T2' | 'T3';
type OutputType = 'quote' | 'pricelist';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPrice(p: Product, tier: Tier): number {
  if (tier === 'T2') return p.t2_price ?? p.t1_price ?? 0;
  if (tier === 'T3') return p.t3_price ?? p.t1_price ?? 0;
  return p.t1_price ?? 0;
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#EDEDE1"/><text x="100" y="115" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#68716E">No image</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function thumbnailSrc(product: Product): string {
  return product.image_urls?.[0] ?? placeholderImg();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuoteBuilder() {
  // Quote config
  const [outputType, setOutputType] = useState<OutputType>('quote');
  const [customerName, setCustomerName] = useState('Customer Name');
  const [title, setTitle] = useState('Fit for work');
  const [introHeadline, setIntroHeadline] = useState('Better gear, clearer choices, quicker decisions.');
  const [introCopy, setIntroCopy] = useState('A workwear quote built from your Spoke product database.');
  const [contactEmail, setContactEmail] = useState('sales@spoke.nz');
  const [contactPhone, setContactPhone] = useState('021 220 1014');
  const [tier, setTier] = useState<Tier>('T1');
  const [logoUnitPrice, setLogoUnitPrice] = useState(5.00);
  const [setupFee, setSetupFee] = useState('Quoted per new logo');

  // File uploads
  const [customerLogo, setCustomerLogo] = useState<string>('');
  const [heroImage, setHeroImage] = useState<string>('');

  // Product search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  // Selected products
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Saved quotes
  const [savedQuotes, setSavedQuotes] = useState<{ id: string; share_token: string; title: string; customer_name: string; updated_at: string }[]>([]);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'selected' | 'settings'>('products');

  // ── Load saved quotes on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/quotes?limit=30')
      .then((r) => r.json())
      .then((d) => setSavedQuotes(d.quotes ?? []))
      .catch(() => {});
  }, []);

  // ── Product search ─────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&tier=${tier}&limit=80`);
      const data = await res.json();
      setSearchResults(data.products ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [tier]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, doSearch]);

  // Initial load — show all products
  useEffect(() => { doSearch(''); }, [doSearch]);

  // ── File helpers ───────────────────────────────────────────────────────────
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (d: string) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target?.result as string ?? '');
    reader.readAsDataURL(file);
  }

  // ── Line item management ───────────────────────────────────────────────────
  function addProduct(product: Product) {
    setLineItems((prev) => {
      if (prev.some((li) => li.product.id === product.id)) return prev;
      return [...prev, { product, qty: 1, logoCount: 1 }];
    });
    setActiveTab('selected');
  }

  function removeItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: 'qty' | 'logoCount', value: number) {
    setLineItems((prev) =>
      prev.map((li, i) => i === idx ? { ...li, [field]: Math.max(0, value) } : li)
    );
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setLineItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = (() => {
    let prodSub = 0, logoSub = 0;
    lineItems.forEach((li) => {
      prodSub += li.qty * getPrice(li.product, tier);
      logoSub += li.qty * li.logoCount * logoUnitPrice;
    });
    const grand = prodSub + logoSub;
    return { prodSub, logoSub, grand, gst: grand * 0.15, incl: grand * 1.15 };
  })();

  // ── Save quote ─────────────────────────────────────────────────────────────
  async function saveQuote() {
    setSaving(true);
    setShareLink('');
    try {
      const body = {
        title,
        customer_name:   customerName,
        intro_headline:  introHeadline,
        intro_copy:      introCopy,
        contact_email:   contactEmail,
        contact_phone:   contactPhone,
        output_type:     outputType,
        pricing_tier:    tier,
        logo_unit_price: logoUnitPrice,
        setup_fee:       setupFee,
        created_by:      'sales',
        line_items: lineItems.map((li) => ({
          qty:              li.qty,
          logo_count:       li.logoCount,
          unit_price:       getPrice(li.product, tier),
          logo_price:       logoUnitPrice,
          line_total:       li.qty * (getPrice(li.product, tier) + li.logoCount * logoUnitPrice),
          product_snapshot: {
            id:           li.product.id,
            stockCode:    li.product.stock_code,
            spokeSkU:     li.product.spoke_sku,
            supplierSku:  li.product.supplier_sku,
            supplier:     li.product.supplier,
            name:         li.product.name,
            description:  li.product.description,
            size:         li.product.size,
            colour:       li.product.colour,
            category:     li.product.category,
            t1Price:      li.product.t1_price,
            t2Price:      li.product.t2_price,
            t3Price:      li.product.t3_price,
            imageUrls:    li.product.image_urls,
          },
        })),
      };

      let url = '/api/quotes';
      let method = 'POST';

      if (currentQuoteId) {
        url = `/api/quotes?id=${currentQuoteId}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      if (!currentQuoteId && data.id) {
        setCurrentQuoteId(data.id);
      }

      const token = data.share_token ?? savedQuotes.find((q) => q.id === currentQuoteId)?.share_token;
      if (token) {
        const link = `${window.location.origin}/api/quotes/share/${token}`;
        setShareLink(link);
      }

      // Refresh list
      const listRes = await fetch('/api/quotes?limit=30');
      const listData = await listRes.json();
      setSavedQuotes(listData.quotes ?? []);

    } catch (err: unknown) {
      alert('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  // ── Download HTML ──────────────────────────────────────────────────────────
  async function downloadHTML() {
    const res = await fetch('/api/quotes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: currentQuoteId, customerLogoDataUrl: customerLogo, heroImageDataUrl: heroImage }),
    });

    if (!res.ok) {
      // Fallback: open share link
      if (shareLink) { window.open(shareLink, '_blank'); return; }
      alert('Save the quote first to get a download link.');
      return;
    }

    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `spoke-${outputType}-${customerName.toLowerCase().replace(/\s+/g,'-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Sync CSV ───────────────────────────────────────────────────────────────
async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setSyncMsg('Uploading and syncing…');
    try {
    const formData = new FormData();
formData.append('csv', file);
const res = await fetch('/api/products/sync-csv', {
  method: 'POST',
  body: formData,
});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setSyncMsg(`✓ Synced ${data.upserted} products`);
    doSearch(searchQuery);
  } catch (err: unknown) {
    setSyncMsg('Error: ' + (err instanceof Error ? err.message : String(err)));
  }
}

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Spoke Quote Builder</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">

        {/* ── Left Panel ── */}
        <aside className="panel">
          <div className="panel-header">
            <div className="spoke-wordmark">spoke</div>
            <div className="panel-subtitle">Quote Builder</div>
          </div>

          {/* Tab bar */}
          <div className="tab-bar">
            {(['products', 'selected', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                className={`tab-btn${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'selected' ? `Selected (${lineItems.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Products Tab ── */}
          {activeTab === 'products' && (
            <div className="tab-content">
              <div className="search-box">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search by name, SKU, colour, category…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searching && <span className="search-spinner">⟳</span>}
              </div>

              <div className="product-list">
                {searchResults.length === 0 && !searching && (
                  <p className="hint">No products found. Upload a CSV to sync the product database.</p>
                )}
                {searchResults.map((p) => (
                  <div key={p.id} className="product-row">
                    <img
                      className="product-thumb"
                      src={thumbnailSrc(p)}
                      alt={p.name}
                      onError={(e) => { (e.target as HTMLImageElement).src = placeholderImg(); }}
                    />
                    <div className="product-info">
                      <div className="product-name">{p.name}</div>
                      <div className="product-meta">
                        {p.spoke_sku || p.supplier_sku}
                        {p.colour ? ` · ${p.colour}` : ''}
                        {p.size ? ` · ${p.size}` : ''}
                      </div>
                      <div className="product-price">{fmt(getPrice(p, tier))}</div>
                    </div>
                    <button className="add-btn" onClick={() => addProduct(p)} title="Add to quote">+</button>
                  </div>
                ))}
              </div>

              <div className="sync-section">
                <label className="sync-label">Sync AS Colour CSV</label>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVUpload} />
                {syncMsg && <p className="hint" style={{ color: syncMsg.startsWith('✓') ? '#BEDA81' : '#ff9999' }}>{syncMsg}</p>}
              </div><div className="sync-section" style={{marginTop: '12px'}}>
  <label className="sync-label">Sync Pricing from Google Sheets</label>
  <button 
    className="btn-primary" 
    style={{fontSize: '11px', padding: '8px 12px'}}
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
    }}
  >
    Sync from Google Sheets
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
                    <img
                      className="selected-thumb"
                      src={thumbnailSrc(li.product)}
                      alt={li.product.name}
                      onError={(e) => { (e.target as HTMLImageElement).src = placeholderImg(); }}
                    />
                    <div className="selected-info">
                      <div className="product-name">{li.product.name}</div>
                      <div className="product-meta">{li.product.spoke_sku || li.product.supplier_sku} · {fmt(getPrice(li.product, tier))}</div>
                      <div className="qty-row">
                        <label>Qty
                          <input type="number" min="0" value={li.qty}
                            onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))} />
                        </label>
                        <label>Logos
                          <input type="number" min="0" value={li.logoCount}
                            onChange={(e) => updateItem(idx, 'logoCount', Number(e.target.value))} />
                        </label>
                        <span className="line-total">{fmt(li.qty * (getPrice(li.product, tier) + li.logoCount * logoUnitPrice))}</span>
                      </div>
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
                  <select value={outputType} onChange={(e) => setOutputType(e.target.value as OutputType)}>
                    <option value="quote">Quote</option>
                    <option value="pricelist">Price List</option>
                  </select>
                </label>

                <label>Pricing tier
                  <select value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
                    <option value="T1">T1 (Standard)</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                  </select>
                </label>

                <label>Customer name
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </label>

                <label>Quote title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>

                <label>Intro headline
                  <input value={introHeadline} onChange={(e) => setIntroHeadline(e.target.value)} />
                </label>

                <label>Intro copy
                  <textarea value={introCopy} onChange={(e) => setIntroCopy(e.target.value)} rows={3} />
                </label>

                <label>Contact email
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                </label>

                <label>Contact phone
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </label>

                <label>Logo price / position (excl GST)
                  <input type="number" min="0" step="0.50" value={logoUnitPrice}
                    onChange={(e) => setLogoUnitPrice(parseMoney(e.target.value))} />
                </label>

                <label>Setup fee text
                  <input value={setupFee} onChange={(e) => setSetupFee(e.target.value)} />
                </label>

                <label>Customer logo
                  <input type="file" accept="image/*"
                    onChange={(e) => handleFileUpload(e, setCustomerLogo)} />
                  {customerLogo && <img src={customerLogo} alt="logo preview" className="file-preview" />}
                </label>

                <label>Hero image
                  <input type="file" accept="image/*"
                    onChange={(e) => handleFileUpload(e, setHeroImage)} />
                  {heroImage && <img src={heroImage} alt="hero preview" className="file-preview" />}
                </label>
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="panel-actions">
            <button className="btn-primary" onClick={saveQuote} disabled={saving}>
              {saving ? 'Saving…' : currentQuoteId ? 'Update quote' : 'Save quote'}
            </button>
            {shareLink && (
              <div className="share-box">
                <span className="share-label">Share link:</span>
                <input className="share-input" readOnly value={shareLink} onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button className="btn-copy" onClick={() => navigator.clipboard.writeText(shareLink)}>Copy</button>
              </div>
            )}
          </div>

          {/* Saved quotes */}
          {savedQuotes.length > 0 && (
            <div className="saved-section">
              <div className="saved-label">Recent quotes</div>
              <div className="saved-list">
                {savedQuotes.slice(0, 10).map((q) => (
                  <div
                    key={q.id}
                    className={`saved-item${q.id === currentQuoteId ? ' active' : ''}`}
                    onClick={() => {
                      setCurrentQuoteId(q.id);
                      const link = `${window.location.origin}/api/quotes/share/${q.share_token}`;
                      setShareLink(link);
                    }}
                  >
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
              <button className="btn-secondary" onClick={() => window.open(shareLink || '', '_blank')} disabled={!shareLink}>
                Open share link
              </button>
              <button className="btn-secondary" onClick={downloadHTML}>
                Download HTML
              </button>
            </div>
          </div>

          {lineItems.length === 0 ? (
            <div className="preview-empty">
              <div className="preview-empty-icon">📋</div>
              <h2>Start building a quote</h2>
              <p>Search for products in the left panel and add them to your quote. Your live preview will appear here.</p>
            </div>
          ) : (
            <div className="preview-content">
              {/* Quote header preview */}
              <div className="preview-header">
                <div className="preview-logo">spoke</div>
                <div className="preview-meta">
                  <strong>{customerName}</strong> · {title} · {tier} pricing
                </div>
              </div>

              {/* Product cards preview */}
              <div className="preview-cards">
                {lineItems.map((li, idx) => (
                  <div key={li.product.id} className="preview-card">
                    <div className="preview-card-img">
                      <img
                        src={thumbnailSrc(li.product)}
                        alt={li.product.name}
                        onError={(e) => { (e.target as HTMLImageElement).src = placeholderImg(); }}
                      />
                    </div>
                    <div className="preview-card-body">
                      <div className="preview-card-num">Option {idx + 1}</div>
                      <div className="preview-card-name">{li.product.name}</div>
                      <div className="preview-card-detail">{li.product.colour} · {li.product.size}</div>
                      <div className="preview-card-price">
                        <span>{fmt(getPrice(li.product, tier))} / unit</span>
                        <span className="preview-card-total">{fmt(li.qty * (getPrice(li.product, tier) + li.logoCount * logoUnitPrice))} total</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
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

              <p className="preview-note">
                Save the quote to get a shareable link, or download as a self-contained HTML file.
              </p>
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }

        :root {
          --mineral: #40514F;
          --zest: #BEDA81;
          --stone: #EDEDE1;
          --paper: #FAFAF4;
          --black: #1A1418;
          --muted: #68716E;
          --line: rgba(64,81,79,.16);
          --bg: #d8d8cc;
        }

        html, body { margin: 0; padding: 0; background: var(--bg); }

        body {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: var(--black);
          font-size: 14px;
          line-height: 1.5;
        }

        .app {
          display: grid;
          grid-template-columns: 420px 1fr;
          min-height: 100vh;
        }

        /* ── Panel ── */
        .panel {
          background: var(--mineral);
          color: #fff;
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow: hidden;
        }

        .panel-header {
          padding: 22px 24px 0;
          flex-shrink: 0;
        }

        .spoke-wordmark {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          font-size: 32px;
          color: var(--zest);
          letter-spacing: -.02em;
          line-height: 1;
          margin-bottom: 2px;
        }

        .panel-subtitle {
          font-size: 11px;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgba(255,255,255,.5);
          margin-bottom: 16px;
        }

        /* Tab bar */
        .tab-bar {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,.12);
          flex-shrink: 0;
          padding: 0 24px;
        }

        .tab-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,.5);
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .06em;
          text-transform: uppercase;
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: color .15s, border-color .15s;
          margin-bottom: -1px;
        }

        .tab-btn.active,
        .tab-btn:hover {
          color: var(--zest);
          border-bottom-color: var(--zest);
        }

        /* Tab content scroll area */
        .tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.2) transparent;
        }

        /* ── Search ── */
        .search-box {
          position: relative;
        }

        .search-input {
          width: 100%;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 4px;
          color: #fff;
          padding: 10px 36px 10px 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          outline: none;
          transition: border-color .15s;
        }

        .search-input:focus {
          border-color: var(--zest);
        }

        .search-input::placeholder {
          color: rgba(255,255,255,.35);
        }

        .search-spinner {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--zest);
          animation: spin 1s linear infinite;
          font-size: 16px;
        }

        @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

        /* ── Product list ── */
        .product-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-height: 200px;
        }

        .product-row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 4px;
          padding: 8px 10px;
          transition: background .12s;
        }

        .product-row:hover { background: rgba(255,255,255,.1); }

        .product-thumb {
          width: 48px;
          height: 48px;
          object-fit: contain;
          background: rgba(255,255,255,.1);
          border-radius: 3px;
          flex-shrink: 0;
        }

        .product-info { flex: 1; min-width: 0; }

        .product-name {
          font-weight: 600;
          font-size: 13px;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .product-meta {
          font-size: 11px;
          color: rgba(255,255,255,.5);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .product-price {
          font-size: 12px;
          font-weight: 700;
          color: var(--zest);
          margin-top: 2px;
        }

        .add-btn {
          background: var(--zest);
          color: var(--mineral);
          border: none;
          border-radius: 3px;
          width: 28px;
          height: 28px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity .12s;
        }

        .add-btn:hover { opacity: .85; }

        /* ── Sync section ── */
        .sync-section {
          border-top: 1px solid rgba(255,255,255,.1);
          padding-top: 12px;
          margin-top: auto;
        }

        .sync-label {
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--zest);
          font-weight: 700;
          display: block;
          margin-bottom: 6px;
        }

        .sync-section input[type="file"] {
          color: rgba(255,255,255,.7);
          font-size: 12px;
          width: 100%;
        }

        /* ── Selected list ── */
        .selected-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .selected-item {
          display: flex;
          gap: 10px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 4px;
          padding: 10px;
          align-items: flex-start;
        }

        .selected-thumb {
          width: 48px;
          height: 48px;
          object-fit: contain;
          background: rgba(255,255,255,.1);
          border-radius: 3px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .selected-info { flex: 1; min-width: 0; }

        .qty-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        .qty-row label {
          font-size: 10px;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: rgba(255,255,255,.5);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .qty-row input[type="number"] {
          width: 60px;
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 3px;
          color: #fff;
          padding: 5px 8px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          -moz-appearance: textfield;
        }

        .qty-row input[type="number"]::-webkit-inner-spin-button { display: none; }

        .line-total {
          font-weight: 700;
          color: var(--zest);
          font-size: 13px;
          margin-left: auto;
          white-space: nowrap;
        }

        .item-actions {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .icon-btn {
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.12);
          color: rgba(255,255,255,.7);
          border-radius: 3px;
          width: 26px;
          height: 26px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background .12s;
        }

        .icon-btn:hover { background: rgba(255,255,255,.15); }
        .icon-btn.danger { color: #ff8888; }
        .icon-btn:disabled { opacity: .3; cursor: not-allowed; }

        /* Totals box */
        .totals-box {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 4px;
          padding: 12px 14px;
          margin-top: 8px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 13px;
          color: rgba(255,255,255,.7);
          border-top: 1px solid rgba(255,255,255,.07);
        }

        .total-row:first-child { border-top: none; }
        .total-row.grand { color: var(--zest); font-weight: 700; font-size: 15px; }

        /* ── Settings ── */
        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .settings-grid label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--zest);
          font-weight: 700;
        }

        .settings-grid input,
        .settings-grid select,
        .settings-grid textarea {
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 4px;
          color: #fff;
          padding: 9px 11px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          outline: none;
          width: 100%;
          transition: border-color .15s;
        }

        .settings-grid select option { background: var(--mineral); }
        .settings-grid input:focus,
        .settings-grid select:focus,
        .settings-grid textarea:focus { border-color: var(--zest); }
        .settings-grid textarea { resize: vertical; min-height: 60px; }

        .file-preview {
          max-height: 48px;
          max-width: 120px;
          object-fit: contain;
          margin-top: 4px;
          background: rgba(255,255,255,.1);
          padding: 4px;
          border-radius: 3px;
        }

        /* ── Panel actions ── */
        .panel-actions {
          padding: 14px 24px;
          border-top: 1px solid rgba(255,255,255,.1);
          flex-shrink: 0;
        }

        .btn-primary {
          background: var(--zest);
          color: var(--mineral);
          border: none;
          border-radius: 4px;
          padding: 11px 20px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 800;
          font-size: 12px;
          letter-spacing: .1em;
          text-transform: uppercase;
          cursor: pointer;
          width: 100%;
          transition: opacity .15s;
        }

        .btn-primary:hover { opacity: .88; }
        .btn-primary:disabled { opacity: .4; cursor: not-allowed; }

        .share-box {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-top: 10px;
          background: rgba(255,255,255,.06);
          border-radius: 4px;
          padding: 8px;
        }

        .share-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: var(--zest);
          white-space: nowrap;
          font-weight: 700;
        }

        .share-input {
          flex: 1;
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 3px;
          color: rgba(255,255,255,.8);
          padding: 5px 8px;
          font-size: 11px;
          min-width: 0;
          cursor: text;
        }

        .btn-copy {
          background: rgba(190,218,129,.2);
          border: 1px solid var(--zest);
          color: var(--zest);
          border-radius: 3px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        /* ── Saved quotes ── */
        .saved-section {
          border-top: 1px solid rgba(255,255,255,.1);
          padding: 12px 24px 16px;
          flex-shrink: 0;
        }

        .saved-label {
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(255,255,255,.4);
          font-weight: 700;
          margin-bottom: 8px;
        }

        .saved-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 160px;
          overflow-y: auto;
        }

        .saved-item {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 6px 10px;
          border-radius: 3px;
          cursor: pointer;
          transition: background .12s;
          background: rgba(255,255,255,.04);
        }

        .saved-item:hover { background: rgba(255,255,255,.1); }
        .saved-item.active { background: rgba(190,218,129,.15); }

        .saved-item-name {
          font-size: 12px;
          color: rgba(255,255,255,.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
          margin-right: 8px;
        }

        .saved-item-date {
          font-size: 10px;
          color: rgba(255,255,255,.35);
          flex-shrink: 0;
        }

        /* ── Preview pane ── */
        .preview-pane {
          display: flex;
          flex-direction: column;
          padding: 24px;
          overflow-y: auto;
          min-height: 100vh;
        }

        .preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .preview-title {
          font-size: 11px;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 700;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
        }

        .btn-secondary {
          background: rgba(64,81,79,.1);
          border: 1px solid rgba(64,81,79,.25);
          color: var(--mineral);
          border-radius: 4px;
          padding: 8px 14px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: .08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background .15s;
        }

        .btn-secondary:hover { background: rgba(64,81,79,.18); }
        .btn-secondary:disabled { opacity: .35; cursor: not-allowed; }

        /* Empty state */
        .preview-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 60px 40px;
          color: var(--muted);
        }

        .preview-empty-icon { font-size: 48px; margin-bottom: 16px; }

        .preview-empty h2 {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          color: var(--mineral);
          font-size: 28px;
          margin: 0 0 12px;
        }

        .preview-empty p {
          max-width: 360px;
          line-height: 1.6;
          font-size: 15px;
        }

        /* Preview content */
        .preview-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .preview-header {
          background: var(--mineral);
          color: #fff;
          border-radius: 6px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .preview-logo {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          color: var(--zest);
          font-size: 22px;
        }

        .preview-meta {
          font-size: 13px;
          color: rgba(255,255,255,.7);
        }

        .preview-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .preview-card {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .preview-card-img {
          background: var(--stone);
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .preview-card-img img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .preview-card-body { padding: 14px; }

        .preview-card-num {
          font-size: 10px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--zest);
          font-weight: 700;
          margin-bottom: 4px;
        }

        .preview-card-name {
          font-weight: 700;
          color: var(--mineral);
          font-size: 15px;
          margin-bottom: 4px;
        }

        .preview-card-detail {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 10px;
        }

        .preview-card-price {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 13px;
          color: var(--muted);
          border-top: 1px solid var(--line);
          padding-top: 8px;
        }

        .preview-card-total {
          font-weight: 700;
          color: var(--mineral);
          font-size: 15px;
        }

        .preview-totals {
          background: #fff;
          border: 1px solid var(--line);
          border-top: 4px solid var(--zest);
          border-radius: 4px;
          padding: 20px 24px;
          max-width: 400px;
          margin-left: auto;
        }

        .preview-totals table { width: 100%; border-collapse: collapse; }
        .preview-totals td { padding: 6px 0; font-size: 14px; }
        .preview-totals td:last-child { text-align: right; font-weight: 600; }
        .preview-totals tr.grand td { border-top: 2px solid var(--line); font-size: 17px; font-weight: 800; color: var(--mineral); padding-top: 10px; }

        .preview-note {
          font-size: 12px;
          color: var(--muted);
          text-align: center;
          padding-bottom: 20px;
        }

        .hint {
          font-size: 12px;
          color: rgba(255,255,255,.4);
          margin: 0;
        }

        @media (max-width: 768px) {
          .app { grid-template-columns: 1fr; }
          .panel { height: auto; position: relative; }
        }
      `}</style>
    </>
  );
}
