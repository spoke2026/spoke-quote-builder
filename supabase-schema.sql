-- ═══════════════════════════════════════════════════════════════
-- Spoke Quote Builder — Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- Project: lehrjxiabetjrmmrytjd
-- ═══════════════════════════════════════════════════════════════

-- ─── Products table ──────────────────────────────────────────────────────────
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  stock_code      text,
  style_code      text,
  supplier_sku    text unique,
  spoke_sku       text,
  supplier        text default 'AS Colour',
  name            text not null,
  description     text default '',
  size            text default '',
  colour          text default '',
  category        text default '',
  gender          text default '',
  cost            numeric(10,2) default 0,
  t1_price        numeric(10,2) default 0,
  t1_gp           numeric(5,2) default 0,
  t2_price        numeric(10,2) default 0,
  t2_gp           numeric(5,2) default 0,
  t3_price        numeric(10,2) default 0,
  t3_gp           numeric(5,2) default 0,
  image_urls      text[] default array[]::text[],
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Full-text search index on name, colour, category, sku
create index if not exists products_name_idx    on products using gin(to_tsvector('english', coalesce(name,'')));
create index if not exists products_sku_idx     on products (supplier_sku);
create index if not exists products_spoke_idx   on products (spoke_sku);
create index if not exists products_category_idx on products (category);

-- ─── Quotes table ────────────────────────────────────────────────────────────
create table if not exists quotes (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default 'Fit for work',
  customer_name   text not null default '',
  intro_headline  text default 'Better gear, clearer choices, quicker decisions.',
  intro_copy      text default '',
  contact_email   text default 'sales@spoke.nz',
  contact_phone   text default '021 220 1014',
  output_type     text not null default 'quote' check (output_type in ('quote','pricelist')),
  pricing_tier    text not null default 'T1' check (pricing_tier in ('T1','T2','T3')),
  logo_unit_price numeric(10,2) default 5.00,
  setup_fee       text default 'Quoted per new logo',
  line_items      jsonb not null default '[]'::jsonb,
  created_by      text default '',
  share_token     text unique default encode(gen_random_bytes(16), 'hex'),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists quotes_share_token_idx on quotes (share_token);
create index if not exists quotes_created_by_idx  on quotes (created_by);

-- ─── Auto-update updated_at ──────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute procedure update_updated_at_column();

create trigger quotes_updated_at
  before update on quotes
  for each row execute procedure update_updated_at_column();

-- ─── Row-level security (open read, authenticated write) ─────────────────────
alter table products enable row level security;
alter table quotes    enable row level security;

-- Anyone can read products and shared quotes
create policy "Public read products"    on products for select using (true);
create policy "Public read quotes"      on quotes   for select using (true);

-- Only authenticated users can write (the sales team)
create policy "Auth write products"     on products for all using (auth.role() = 'authenticated');
create policy "Auth write quotes"       on quotes   for all using (auth.role() = 'authenticated');

-- ─── Sample data helper (optional) ───────────────────────────────────────────
-- Uncomment to insert a test product:
-- insert into products (supplier_sku, spoke_sku, name, colour, size, t1_price, image_urls)
-- values ('5101', 'SPK-5101', 'AS Colour Staple Tee', 'Black', 'XS-5XL', 29.95, array['https://cdn.ascolour.com/staple-tee-black.jpg'])
-- on conflict (supplier_sku) do nothing;
