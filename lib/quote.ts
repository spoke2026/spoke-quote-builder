import { NormalisedProduct, PricingTier, formatMoney, getPrice, parseMoney } from './products';

export interface QuoteConfig {
  outputType: 'quote' | 'pricelist';
  customerName: string;
  title: string;
  introHeadline: string;
  introCopy: string;
  contactEmail: string;
  contactPhone: string;
  tier: PricingTier;
  logoUnitPrice: number;   // default logo price per position
  setupFee: string;
  customerLogoDataUrl?: string;
  heroImageDataUrl?: string;
}

export interface QuoteLineItem {
  product: NormalisedProduct;
  qty: number;
  logoCount: number;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] ?? m)
  );
}

function lineTotal(item: QuoteLineItem, tier: PricingTier, logoUnitPrice: number): number {
  const unit = getPrice(item.product, tier);
  return item.qty * (unit + item.logoCount * logoUnitPrice);
}

export function calculateTotals(
  items: QuoteLineItem[],
  tier: PricingTier,
  logoUnitPrice: number
) {
  let subtotalProducts = 0;
  let subtotalLogos = 0;

  items.forEach((item) => {
    const unit = getPrice(item.product, tier);
    subtotalProducts += item.qty * unit;
    subtotalLogos += item.qty * item.logoCount * logoUnitPrice;
  });

  const grand = subtotalProducts + subtotalLogos;
  const gst = grand * 0.15;

  return {
    subtotalProducts,
    subtotalLogos,
    grandExcl: grand,
    gst,
    grandIncl: grand + gst,
  };
}

// ─── Full self-contained HTML output ─────────────────────────────────────────

export function generateQuoteHTML(
  config: QuoteConfig,
  items: QuoteLineItem[],
  spokeLogoBase64: string
): string {
  const totals = calculateTotals(items, config.tier, config.logoUnitPrice);

  const summaryRows = items
    .map((item, i) => {
      const unit = getPrice(item.product, config.tier);
      const lt = lineTotal(item, config.tier, config.logoUnitPrice);
      return `<tr data-calc-row data-unit="${unit}" data-logo="${config.logoUnitPrice}">
        <td>${i + 1}</td>
        <td>${esc(item.product.name)}</td>
        <td>${esc(item.product.size)}</td>
        <td>${esc(item.product.colour)}</td>
        <td><input class="customer-input" data-qty-input type="number" min="0" step="1" value="${item.qty}" oninput="customerRecalcTotals()"></td>
        <td><input class="customer-input" data-logo-input type="number" min="0" step="1" value="${item.logoCount}" oninput="customerRecalcTotals()"></td>
        <td class="price">${formatMoney(unit)}</td>
        <td class="price" data-line-total>${formatMoney(lt)}</td>
      </tr>`;
    })
    .join('');

  const cards = items
    .map((item, i) => {
      const images = item.product.imageUrls ?? [];
      const mainSrc = images[0] ?? placeholderSvg();
      const thumbs =
        images.length > 1
          ? `<div class="gallery-thumbs">${images
              .map(
                (img, ti) =>
                  `<img src="${esc(img)}" class="${ti === 0 ? 'active' : ''}" onerror="this.style.display='none'"
                    onclick="var m=document.getElementById('gm-${i}');m.src='${esc(img)}';this.parentElement.querySelectorAll('img').forEach(x=>x.classList.remove('active'));this.classList.add('active');">`
              )
              .join('')}</div>`
          : '';

      return `<section class="product-card">
        <div class="product-media">
          <div class="gallery-wrap">
            <img class="gallery-main" id="gm-${i}" src="${esc(mainSrc)}" onerror="this.onerror=null;this.src='${placeholderSvg()}';" alt="${esc(item.product.name)}">
            ${thumbs}
          </div>
        </div>
        <div class="product-copy">
          <div class="eyebrow">Option ${i + 1} · ${esc(item.product.spokeSkU || item.product.stockCode)}</div>
          <h2>${esc(item.product.name)}</h2>
          <p class="summary">${esc(item.product.description)}</p>
          <div class="meta-grid">
            <div><span>Size</span><strong>${esc(item.product.size)}</strong></div>
            <div><span>Colour</span><strong>${esc(item.product.colour)}</strong></div>
            <div><span>Unit price</span><strong>${formatMoney(getPrice(item.product, config.tier))}</strong></div>
            <div><span>Logo price</span><strong>${formatMoney(config.logoUnitPrice)}/logo</strong></div>
          </div>
          <p class="note"><strong>Setup fee:</strong> ${esc(config.setupFee)}</p>
        </div>
      </section>`;
    })
    .join('');

  const heroStyle = config.heroImageDataUrl
    ? `style="background-image:url('${config.heroImageDataUrl}')"`
    : '';

  const clientLogoHtml = config.customerLogoDataUrl
    ? `<img class="client-logo" src="${config.customerLogoDataUrl}" alt="${esc(config.customerName)}">`
    : `<div class="proposal" style="font-size:36px;color:var(--mineral);letter-spacing:0;text-transform:none">${esc(config.customerName)}</div>`;

  const title = config.title || 'Fit for work';
  const titleHtml = esc(title).replace(/work/i, '<em>work</em>');

  const totalBox = `<section class="quote-total-box">
    <h2>Quote total</h2>
    <p style="margin:0 0 12px;color:#68716E;font-size:13px;">Adjust quantities and logo count in the table above to update totals live.</p>
    <div class="total-row"><span>Products subtotal</span><strong data-product-subtotal>${formatMoney(totals.subtotalProducts)}</strong></div>
    <div class="total-row"><span>Logo subtotal</span><strong data-logo-subtotal>${formatMoney(totals.subtotalLogos)}</strong></div>
    <div class="total-row"><span>Total excl GST</span><strong data-grand-total>${formatMoney(totals.grandExcl)}</strong></div>
    <div class="total-row"><span>GST 15%</span><strong data-gst-total>${formatMoney(totals.gst)}</strong></div>
    <div class="total-row grand"><span>Total incl GST</span><strong data-incl-gst-total>${formatMoney(totals.grandIncl)}</strong></div>
  </section>`;

  const mailto = `mailto:${encodeURIComponent(config.contactEmail)}?subject=${encodeURIComponent(config.customerName + ' order request')}`;

  const cta = `<section class="terms">
    <div class="terms-inner">
      <h2>Quote notes</h2>
      <p><strong>Logo:</strong> Calculated per product based on selected logo positions.</p>
      <p><strong>Setup fee:</strong> ${esc(config.setupFee)}</p>
      <p><strong>Pricing:</strong> Subject to change without notice.</p>
      <p><strong>GST:</strong> Added where pricing is listed excluding GST.</p>
      <p><strong>Freight:</strong> Additional unless otherwise stated.</p>
    </div>
  </section>
  <section class="cta">
    <div>
      <h2>Ready to gear up your team?</h2>
      <p>Talk to us directly and we'll find the right setup for your operation. Fast turnaround, no fuss.</p>
    </div>
    <a href="${mailto}">Place your order</a>
  </section>
  <footer>
    <img class="footer-logo-img" src="${spokeLogoBase64}" alt="Spoke">
    <div>&copy; ${new Date().getFullYear()} Spoke Solutions. Workwear, PPE and branded gear made simple.</div>
  </footer>`;

  const priceListRows = items
    .map((item) => {
      const unit = getPrice(item.product, config.tier);
      const lt = lineTotal(item, config.tier, config.logoUnitPrice);
      const img = item.product.imageUrls?.[0] ?? placeholderSvg();
      return `<tr data-calc-row data-unit="${unit}" data-logo="${config.logoUnitPrice}">
        <td><img class="price-thumb" src="${esc(img)}" onerror="this.onerror=null;this.src='${placeholderSvg()}';" alt=""></td>
        <td><strong>${esc(item.product.spokeSkU || item.product.stockCode)}</strong></td>
        <td>${esc(item.product.name)}<br><span style="color:#68716E;font-size:12px">${esc(item.product.description)}</span></td>
        <td>${esc(item.product.size)}</td>
        <td>${esc(item.product.colour)}</td>
        <td><input class="customer-input" data-qty-input type="number" min="0" step="1" value="${item.qty}" oninput="customerRecalcTotals()"></td>
        <td><input class="customer-input" data-logo-input type="number" min="0" step="1" value="${item.logoCount}" oninput="customerRecalcTotals()"></td>
        <td class="price">${formatMoney(unit)}</td>
        <td class="price" data-line-total>${formatMoney(lt)}</td>
      </tr>`;
    })
    .join('');

  const bodyContent =
    config.outputType === 'pricelist'
      ? `<header class="quote-header">
          <img class="quote-logo-img" src="${spokeLogoBase64}" alt="Spoke">
          <div class="quote-contact">spoke.nz<br>${esc(config.contactEmail)}</div>
        </header>
        <section class="hero">
          <div class="hero-copy"><div class="proposal">Prepared for</div>${clientLogoHtml}<h1>${titleHtml}.</h1></div>
          <div class="hero-image" ${heroStyle}></div>
        </section>
        <div class="fit-bar">Price list | Prepared by Spoke</div>
        <section class="intro"><h2>${esc(config.introHeadline)}</h2><p>${esc(config.introCopy)}</p></section>
        <section class="summary-table-wrap">
          <table>
            <thead><tr><th>Image</th><th>Code</th><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th>Logos</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>${priceListRows}</tbody>
          </table>
        </section>
        ${totalBox}${cta}`
      : `<header class="quote-header">
          <img class="quote-logo-img" src="${spokeLogoBase64}" alt="Spoke">
          <div class="quote-contact">spoke.nz<br>${esc(config.contactEmail)}</div>
        </header>
        <section class="hero">
          <div class="hero-copy"><div class="proposal">Prepared for</div>${clientLogoHtml}<h1>${titleHtml}.</h1><p>Workwear, PPE and branded gear selected for ${esc(config.customerName)}.</p></div>
          <div class="hero-image" ${heroStyle}></div>
        </section>
        <div class="fit-bar">Workwear quote | Prepared by Spoke</div>
        <section class="intro"><h2>${esc(config.introHeadline)}</h2><p>${esc(config.introCopy)}</p></section>
        <section class="summary-table-wrap">
          <table>
            <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th>Logos</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>${summaryRows}</tbody>
          </table>
        </section>
        <section class="products">${cards}</section>
        ${totalBox}${cta}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(config.customerName)} — ${esc(title)} | Spoke</title>
${QUOTE_STYLES}
</head>
<body>
<div class="output-actions" style="padding:16px;text-align:right;background:#d8d8cc;">
  <button onclick="window.print()">Print to PDF</button>
</div>
<main id="quotePreview" style="max-width:1040px;margin:auto;background:var(--stone);box-shadow:0 22px 70px rgba(26,20,24,.13)">
  ${bodyContent}
</main>
<script>
function formatMoney(v){return'$'+Number(v||0).toFixed(2);}
function customerRecalcTotals(){
  let ps=0,ls=0;
  document.querySelectorAll('[data-calc-row]').forEach(row=>{
    const unit=Number(row.dataset.unit||0),logo=Number(row.dataset.logo||0);
    const qi=row.querySelector('[data-qty-input]'),li=row.querySelector('[data-logo-input]');
    const qty=Number(qi?qi.value:0),logos=Number(li?li.value:0);
    ps+=qty*unit; ls+=qty*logos*logo;
    row.querySelectorAll('[data-line-total]').forEach(el=>el.textContent=formatMoney(qty*(unit+logos*logo)));
  });
  const excl=ps+ls,gst=excl*0.15,incl=excl+gst;
  document.querySelectorAll('[data-product-subtotal]').forEach(el=>el.textContent=formatMoney(ps));
  document.querySelectorAll('[data-logo-subtotal]').forEach(el=>el.textContent=formatMoney(ls));
  document.querySelectorAll('[data-grand-total]').forEach(el=>el.textContent=formatMoney(excl));
  document.querySelectorAll('[data-gst-total]').forEach(el=>el.textContent=formatMoney(gst));
  document.querySelectorAll('[data-incl-gst-total]').forEach(el=>el.textContent=formatMoney(incl));
}
</script>
</body>
</html>`;
}

function placeholderSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500"><rect width="600" height="500" fill="#fff"/><circle cx="300" cy="220" r="70" fill="#BEDA81"/><path d="M210 330h180l55 70H155z" fill="#40514F"/><text x="300" y="455" text-anchor="middle" font-family="Arial" font-weight="700" font-size="24" fill="#40514F">IMAGE NEEDED</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const QUOTE_STYLES = `<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
:root{--mineral:#40514F;--zest:#BEDA81;--stone:#EDEDE1;--paper:#FAFAF4;--black:#1A1418;--muted:#68716E;--line:rgba(64,81,79,.16)}
*{box-sizing:border-box}
body{margin:0;background:#d8d8cc;color:var(--black);font-family:'DM Sans',Arial,sans-serif}
button{border:0;border-radius:2px;background:var(--zest);color:var(--mineral);font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:12px 16px;cursor:pointer}
.customer-input{width:72px;border:1px solid var(--line);background:#fff;color:var(--mineral);padding:8px;font-weight:700;text-align:center}
.quote-total-box{background:#fff;border-top:4px solid var(--zest);padding:24px 30px;margin:0 58px 44px}
.quote-total-box h2{margin:0 0 12px;color:var(--mineral);font-family:Georgia,'DM Serif Display',serif;font-size:26px}
.total-row{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding:10px 0;font-size:15px}
.total-row.grand{font-size:22px;font-weight:800;color:var(--mineral)}
.quote-header{background:var(--mineral);padding:24px 44px;display:flex;align-items:center;justify-content:space-between;color:#fff}
.quote-logo-img{width:150px;height:auto;display:block}
.quote-contact{text-align:right;font-size:13px;color:rgba(255,255,255,.72);line-height:1.7}
.hero{display:grid;grid-template-columns:52% 48%;min-height:520px;background:var(--stone)}
.hero-copy{padding:70px 58px 58px;display:flex;flex-direction:column;justify-content:center}
.proposal{color:var(--muted);font-size:13px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:28px}
.client-logo{max-width:330px;max-height:120px;object-fit:contain;margin-bottom:34px;align-self:flex-start}
.hero h1{margin:0 0 18px;font-family:Georgia,'DM Serif Display',serif;font-size:clamp(44px,6vw,74px);line-height:.96;letter-spacing:-.04em;color:var(--mineral)}
.hero h1 em{color:var(--zest);font-style:italic}
.hero p{color:var(--muted);font-size:18px;max-width:440px;margin:0}
.hero-image{background:linear-gradient(135deg,#40514F,#1A1418);min-height:520px;background-size:cover;background-position:center}
.fit-bar{background:var(--mineral);color:#fff;padding:22px 58px;letter-spacing:.18em;text-transform:uppercase;font-size:13px}
.intro{padding:46px 58px 18px;display:grid;grid-template-columns:1.1fr .9fr;gap:42px;align-items:end}
.intro h2{margin:0;font-family:Georgia,'DM Serif Display',serif;font-style:italic;color:var(--mineral);font-size:34px;line-height:1.12}
.intro p{margin:0;color:var(--muted);font-size:15px;line-height:1.65}
.summary-table-wrap{padding:0 58px 38px;overflow:auto}
table{width:100%;border-collapse:collapse;background:#fff}
th{background:var(--mineral);color:#fff;text-align:left;padding:12px 14px;font-size:11px;letter-spacing:.09em;text-transform:uppercase}
td{padding:13px 14px;border-top:1px solid var(--line);color:#2a2a2a;font-size:14px;vertical-align:middle}
td.price{color:var(--mineral);font-weight:700;white-space:nowrap}
.price-thumb{width:72px;height:72px;object-fit:contain;background:#fff}
.products{padding:10px 58px 46px;display:grid;gap:24px}
.product-card{background:#fff;border:1px solid var(--line);display:grid;grid-template-columns:42% 58%;min-height:420px}
.product-media{background:#fff;padding:30px;display:flex;align-items:center;justify-content:center;border-right:1px solid var(--line)}
.product-media img{width:100%;max-height:380px;object-fit:contain}
.gallery-wrap{width:100%}
.gallery-main{width:100%;max-height:340px;object-fit:contain;background:#fff}
.gallery-thumbs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center}
.gallery-thumbs img{width:64px;height:64px;object-fit:contain;border:2px solid transparent;cursor:pointer;background:#fff;padding:4px}
.gallery-thumbs img.active{border-color:var(--zest)}
.product-copy{padding:34px 36px}
.eyebrow{color:var(--zest);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:8px}
.product-copy h2{margin:0 0 10px;font-family:Georgia,'DM Serif Display',serif;color:var(--mineral);font-size:30px;line-height:1.08}
.summary{margin:0 0 18px;color:var(--muted);font-size:15px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.meta-grid div{background:var(--stone);padding:12px;border-left:3px solid var(--zest)}
.meta-grid span{display:block;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
.meta-grid strong{color:var(--mineral);font-size:14px}
.note{margin:16px 0 0;padding-top:15px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.terms{padding:0 58px 44px}
.terms-inner{background:#fff;border-top:4px solid var(--zest);padding:26px 30px}
.terms h2{margin:0 0 10px;color:var(--mineral);font-family:Georgia,'DM Serif Display',serif;font-size:26px}
.terms p{margin:6px 0;color:#2a2a2a;font-size:13px}
.cta{background:var(--mineral);color:#fff;padding:44px 58px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center}
.cta h2{margin:0 0 8px;font-family:Georgia,'DM Serif Display',serif;font-style:italic;font-size:32px}
.cta p{margin:0;color:rgba(255,255,255,.74);max-width:540px}
.cta a{background:var(--zest);color:var(--mineral);text-decoration:none;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:16px 32px;border-radius:2px;white-space:nowrap}
footer{background:#2a2a2a;padding:24px 44px;text-align:center;color:#777;font-size:11px}
.footer-logo-img{width:120px;height:auto;display:block;margin:0 auto 12px}
@media(max-width:980px){.hero,.intro,.product-card,.cta{grid-template-columns:1fr}.hero-image{min-height:320px;order:-1}}
@media print{body{background:#fff}.output-actions{display:none}#quotePreview{box-shadow:none;max-width:none;margin:0}.product-card{break-inside:avoid}.quote-header,.fit-bar,.cta,footer,td,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>`;
