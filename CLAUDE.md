# Spoke Quote Builder

## Overview
Quote builder application for Spoke workwear. Users search products (from Supabase), build quotes with pricing tiers (T1/T2/T3/Indent), add logo customization options, and share quotes via shareable links. Quotes and product data stored in Supabase with daily GitHub backups.

## Tech Stack
- **Framework:** Next.js 14.2.3 (Pages Router)
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Vercel
- **Language:** TypeScript
- **AI/Scraping:** Claude API (product data extraction from URLs)

## Key Directories
- `/pages` - Next.js pages and API routes
- `/pages/api/products/` - Product search, sync, scrape endpoints
- `/pages/api/quotes/` - Quote CRUD, share link, backup endpoints
- `/pages/api/backups/` - Daily GitHub backup system
- `/components` - React modals (ProductFromUrlModal, EditProductModal)
- `/lib` - Supabase client config, product utilities, quote generation
- `/public` - Static assets

---

## Database Setup (Supabase)

### Project Credentials
- **Project URL:** `https://jdvksxdfiquzilijavhh.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdmtzeGRmaXF1emlsaWphdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDE2MDgsImV4cCI6MjA5NzgxNzYwOH0.8RnwFZco85oYzdKbq6k-QGWDiqXG9XaLJRaChxKxgYk`
- **Service Role Key:** (Set as `SUPABASE_SERVICE_ROLE_KEY` in Vercel env vars - KEEP PRIVATE)

### Tables Schema

#### `products` table
Core product catalog with pricing and images. Fields include:
- `id` (UUID, primary key)
- `stock_code`, `style_code` (AS Colour identifiers)
- `supplier_sku` (UNIQUE, used for deduplication)
- `spoke_sku` (internal Spoke SKU)
- `supplier`, `name`, `description`, `short_description`
- `size`, `colour`, `category`, `gender`, `composition`
- `cost`, `t1_price`, `t1_gp`, `t2_price`, `t2_gp`, `t3_price`, `t3_gp`, `indent_price`
- `image_urls` (TEXT[] array), `features` (TEXT[] array)
- `created_at`, `updated_at` (timestamps)

**Indexes:** `supplier_sku`, `name` for fast search

#### `quotes` table
Saved quotes with shareable links. Fields include:
- `id` (UUID, primary key)
- `title`, `customer_name`, `intro_headline`, `intro_copy`
- `contact_email`, `contact_phone`
- `output_type` ('quote' | 'pricelist')
- `pricing_tier` ('T1' | 'T2' | 'T3')
- `logo_unit_price`, `setup_fee`
- `line_items` (JSONB - array of line items with product snapshots)
- `created_by`, `customer_logo_data_url`, `hero_image_data_url`
- `share_token` (UNIQUE - generated on creation, used in share URLs)
- `created_at`, `updated_at` (timestamps)

**Indexes:** `share_token`, `created_by`, `updated_at` for filtering/sorting

### Row Level Security (RLS)
**Important:** RLS is **enabled** on both tables to prevent public access via anon key.
- **Client-side** (browser): Uses anon key, restricted by RLS
- **Server-side** (API routes): Uses service role key to bypass RLS

All API routes in `/pages/api/` use `supabaseAdmin` (service role) to read/write data.

---

## Environment Variables (Vercel)

### Required
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for server-side database access (PRIVATE)
- `GITHUB_BACKUP_TOKEN` - GitHub personal access token for daily backups (PRIVATE)
- `ANTHROPIC_API_KEY` - For Claude API calls in product scraping (PRIVATE)

### Optional (if using Google Sheets sync)
- `GOOGLE_SHEETS_ID` - Google Sheet ID for syncing product data
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key

---

## Data Flows

### Product Sync Flow
1. **From CSV:** User uploads CSV → `/api/products/sync-csv` → Supabase
   - Detects CSV type (AS Colour stockItems vs generic)
   - Groups by styleCode, deduplicates
   - Deletes old AS Colour products on first sync
   - Inserts/updates via service role key

2. **From Google Sheets:** `/api/products/sync-master-data` fetches Sheet via Google API
   - Filters rows with valid `Supplier SKU`
   - Updates existing products by SKU, inserts new ones
   - Extracts: Spoke SKU, pricing (T1/T2/T3/Indent), GP%, gender, description

3. **From URL:** User pastes URL → `/api/products/scrape-url`
   - Fetches webpage, extracts images
   - Calls Claude API to extract: name, SKU, description, features, sizes, colours, composition
   - Returns product data + up to 8 images
   - User manually saves via `/api/products/save-product` endpoint

### Quote Creation Flow
1. User searches products → `/api/products/search` (full-text on name, SKU, colour, category)
2. User builds quote with line items, pricing tier, categories
3. User saves → `POST /api/quotes`
   - Generates unique `share_token` (random 16+ char string)
   - Stores full quote + product snapshots in `line_items` JSONB
   - Returns `id` and `share_token`

4. User shares via: `https://quotes.spoke.nz/api/quotes/share/{share_token}`
   - Public read-only endpoint (no auth needed)
   - Renders HTML preview of quote

### Backup Flow
1. **Daily cron job** runs at 2 AM UTC (defined in `vercel.json`)
2. Calls `/api/backups/export` endpoint
3. Exports all products + quotes to JSON
4. Pushes to GitHub repo `/backups/backup-YYYY-MM-DD.json`
5. Auto-deletes backups older than 10 days (keeps last 10)
6. **Critical:** If Supabase deleted, data recoverable from GitHub backups

---

## Important Implementation Details

### Share Token Generation
When creating a quote, a unique token must be generated:
```typescript
function generateShareToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}
```
This is required - if missing, the insert will fail with "not-null constraint" error.

### Service Role Key Usage
All server-side database operations use `supabaseAdmin` (service role key):
- `/pages/api/products/save-product.ts`
- `/pages/api/products/sync-csv.ts`
- `/pages/api/products/sync-master-data.ts`
- `/pages/api/products/search.ts`
- `/pages/api/quotes/index.ts`
- `/pages/api/quotes/generate.ts`
- `/pages/api/quotes/share/[token].ts`
- `/pages/api/backups/export.ts`

**Do not use anon key in API routes** - it will fail due to RLS.

### Product Images
- Stored as URLs in `image_urls` array
- Uploads go to the public `quote-images` Supabase Storage bucket, created on
  first use by `/api/uploads/sign`. The browser PUTs straight to Supabase via a
  signed URL — never through a Vercel function, which hard-caps request bodies
  at 4.5MB regardless of any `bodyParser.sizeLimit`
- The bucket must stay public. Customer share links are unauthenticated, so
  making it private breaks images in every quote already sent
- Quotes saved before this change still hold base64 data URLs and render fine.
  There is no migration; both forms work in an `<img src>`
- Can be from any source: AS Colour, Google Drive, scraped URLs, etc.
- URLs are cleaned (Google Drive -> CDN redirect, etc.)
- Search endpoint returns up to 8 images per product

### Pricing Tiers
- **T1, T2, T3:** Tier pricing (user selects one per quote)
- **Indent:** Large indent orders (separate price point)
- **GP (Gross Profit %):** Stored but not used in UI (informational)
- Fallback: T2/T3/Indent use T1 price if their tier is missing

### Line Items Storage
Quotes store `product_snapshot` - a frozen copy of product data at quote creation time. This preserves pricing/details even if product data changes in database later.

---

## Common Tasks

### Adding a new product field
1. Add column to `products` table in Supabase
2. Update `Product` interface in `/lib/supabase.ts`
3. Update insert/update statements in relevant API routes
4. Update search endpoint select clause
5. Update CSV mappers if applicable

### Modifying quote output
1. Edit `/lib/quote.ts` `generateQuoteHTML()` function
2. Test via `/api/quotes/share/{token}` endpoint
3. Styling is embedded CSS in the HTML

### Troubleshooting sync failures
1. Check Vercel function logs for specific error
2. Common issues:
   - RLS violation → Ensure `SUPABASE_SERVICE_ROLE_KEY` is set
   - Missing columns → Check all required columns exist in Supabase
   - Google Sheets auth → Verify credentials in env vars
   - Duplicate SKU → Check for conflicting `supplier_sku` values

### Recovering from backup
1. Go to `/backups/backup-YYYY-MM-DD.json` in GitHub
2. Download the JSON file
3. Create new Supabase project
4. Manually restore data or import via SQL from the JSON
5. Update credentials in `/lib/supabase.ts`

---

## Coding Style & Standards
- TypeScript with functional components
- Use React hooks (useState, useCallback, useEffect, useMemo)
- Keep components under 300 lines
- All Supabase operations: check error, throw on failure
- Error messages: user-friendly in UI, detailed in console logs
- No comments unless WHY is non-obvious
- Prefer explicit null checks over optional chaining in conditionals

## Git Workflow
- Commit messages: `fix:`, `feat:`, `refactor:` prefixes
- All changes auto-deploy to production via Vercel
- Database changes can't be rolled back - coordinate carefully
- Backup runs daily, available in GitHub `/backups` folder

---

## Known Issues & TODOs
- Live preview calculations: May show NaN for certain pricing combinations
- Share link caching: No cache headers on share endpoint (renders fresh each time)
- PIN protection: Feature flag mentioned in old context, not currently implemented
- Quotes tab filtering: Delete/filter features pending

---

## Support & Debugging
- **Vercel logs:** Check function logs for API errors
- **Supabase logs:** Check SQL editor or Logs in dashboard
- **GitHub backups:** Recovery point always available in `/backups` folder
- **API testing:** Use curl or Postman to test endpoints directly
