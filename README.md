# Spoke Quote Builder

A Next.js quote builder for the Spoke sales team — search products, build quotes, share with clients.

**Live:** https://quotes.spoke.nz  
**GitHub:** spoke2026  
**Database:** Supabase (`lehrjxiabetjrmmrytjd`)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend + Backend | Next.js 14 (Pages Router) |
| Database | Supabase (Postgres + Storage) |
| Deployment | Vercel (region: `syd1`) |
| Fonts | DM Sans + DM Serif Display |

---

## Quick Start

```bash
git clone https://github.com/spoke2026/spoke-quote-builder
cd spoke-quote-builder
npm install
cp .env.local.example .env.local   # fill in your keys
npm run dev
```

Open http://localhost:3000

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service account for Sheets access |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key (with `\n` line breaks) |
| `GOOGLE_SHEETS_ID` | Google Sheet ID from the URL |
| `NEXT_PUBLIC_DEFAULT_TIER` | `T1`, `T2`, or `T3` (default: T1) |

---

## Database Setup

1. Go to your Supabase project → SQL Editor
2. Run the contents of `supabase-schema.sql`

This creates:
- `products` table (with full-text search index)
- `quotes` table (with share tokens)
- Row-level security policies

---

## Data Sources

### AS Colour CSVs (Product data + images)

**Option A — Manual upload in the app:**
- Open the app → Products tab → "Sync AS Colour CSV"
- Upload any CSV with columns: `stockCode`, `styleCode`, `name`, `price`, `colour`, `imageURL`

**Option B — API endpoint:**
```bash
curl -X POST https://quotes.spoke.nz/api/products/sync-csv \
  -H "Content-Type: application/json" \
  -d '{"csvUrl": "https://betacraftnz-my.sharepoint.com/..."}'
```

CSV column names are flexible — the importer normalises headers automatically.

### Master Data Google Sheet (Pricing)

The private Google Sheet should have these columns (row 1 = headers):
```
Supplier SKU | Spoke SKU | Supplier | Description | Size | Colour | Category | Gender | Cost | T1 Price | T1 GP% | T2 Price | T2 GP% | T3 Price | T3 GP%
```

**To sync pricing:**
```bash
curl -X POST https://quotes.spoke.nz/api/products/sync-master-data
```

Or paste rows directly:
```bash
curl -X POST https://quotes.spoke.nz/api/products/sync-master-data \
  -H "Content-Type: application/json" \
  -d '{"rows": [{"Supplier SKU": "5101", "T1 Price": "29.95", ...}]}'
```

**Google Sheets access setup:**
1. Go to Google Cloud Console → IAM → Service Accounts → Create service account
2. Grant it **Viewer** role on the Sheet (share the Sheet to the service account email)
3. Create a JSON key and add `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` to Vercel env vars

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/search?q=&tier=T1` | Search products |
| POST | `/api/products/sync-csv` | Sync AS Colour CSV |
| POST | `/api/products/sync-master-data` | Sync Google Sheets pricing |
| GET | `/api/quotes` | List quotes |
| POST | `/api/quotes` | Create quote → returns `{ id, share_token }` |
| PUT | `/api/quotes?id=xxx` | Update quote |
| DELETE | `/api/quotes?id=xxx` | Delete quote |
| GET | `/api/quotes/share/[token]` | Public shareable HTML quote |
| POST | `/api/quotes/generate` | Download self-contained HTML |

---

## Deployment

```bash
npm install -g vercel
vercel login
vercel --prod
```

Set the custom domain to `quotes.spoke.nz` in the Vercel project settings.

For environment secrets in Vercel:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL
vercel env add GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
vercel env add GOOGLE_SHEETS_ID
```

---

## Quote Output

Each quote can be:
- **Saved** to Supabase with a unique share token
- **Shared** via a link like `https://quotes.spoke.nz/api/quotes/share/abc123`
- **Downloaded** as a self-contained HTML file (no server needed, works offline)

The HTML output matches the existing Spoke design system exactly — DM Sans + DM Serif Display fonts, mineral/zest/stone colour palette, GST-inclusive totals with live qty editing.

---

## Quote Template

The HTML output is derived from `Spoke_Excel_Quote_PriceList_Builder_CLEAN_PRODUCTS_GST.html` — same design, same JS totals logic, same print stylesheet. The `lib/quote.ts` module generates it server-side with product data injected.

---

## Folder Structure

```
spoke-quote-builder/
├── pages/
│   ├── index.tsx              ← Main builder UI
│   ├── _app.tsx
│   └── api/
│       ├── products/
│       │   ├── search.ts      ← GET product search
│       │   ├── sync-csv.ts    ← POST AS Colour CSV sync
│       │   └── sync-master-data.ts  ← POST Google Sheets sync
│       └── quotes/
│           ├── index.ts       ← CRUD quotes
│           ├── generate.ts    ← POST → download HTML
│           └── share/[token].ts  ← GET → shareable HTML
├── lib/
│   ├── supabase.ts            ← DB client + types
│   ├── products.ts            ← Product parsing + search
│   └── quote.ts               ← HTML quote generator
├── supabase-schema.sql        ← Run once in Supabase SQL Editor
├── vercel.json
├── next.config.js
└── .env.local                 ← Your secrets (not committed)
```
