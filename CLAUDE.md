# Spoke Quote Builder

## Tech Stack
- Next.js (Pages Router)
- Supabase (Auth, DB, Storage)
- Vercel deployment
- TypeScript

## Key Directories
- /pages - Next.js pages and routes
- /components - React components
- /lib - Utilities, Supabase client config, database queries
- /public - Static assets

## Important Context
- Quote storage in Supabase
- Live preview calculations (currently has NaN bug)
- Share link functionality (needs caching)
- PIN protection feature
- Quotes tab (delete/filter pending)

## Coding Style
- TypeScript with functional components
- Use React hooks
- Keep components under 300 lines
- Error handling for all Supabase calls
