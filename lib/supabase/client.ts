import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for the login page and the sign-out control.
 *
 * Uses @supabase/ssr's createBrowserClient so the session is written to
 * COOKIES (not localStorage). That is what lets the middleware perimeter and
 * the Pages Router API helper read the session server-side. Do NOT swap this
 * for a localStorage-based client.
 *
 * The NEXT_PUBLIC env vars are inlined at build time. This client is only ever
 * reached from behind the middleware perimeter, which returns 503 first if the
 * vars are missing, so the app never renders misconfigured.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
