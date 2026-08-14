import type { NextApiRequest, NextApiResponse } from "next";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { serialize, type SerializeOptions } from "cookie";

/**
 * Pages Router server-side Supabase client, bound to a single API
 * request/response pair.
 *
 * IMPORTANT — Pages Router uses NextApiRequest / NextApiResponse, which (unlike
 * App Router's NextResponse) has NO .cookies.set() helper. So the cookie
 * adapter must:
 *   - getAll(): read from req.cookies (Next parses these into a plain object)
 *     and map to the { name, value }[] shape @supabase/ssr expects.
 *   - setAll(): serialise each refreshed cookie with the `cookie` package's
 *     serialize(name, value, options) and APPEND them to the response's
 *     Set-Cookie header via res.setHeader (never clobbering an existing one).
 *
 * Without this serialise step, Supabase's ~1-hour access-token refresh never
 * persists back to the browser and users are silently logged out mid-session
 * (it passes a quick login test and only breaks after the refresh window).
 */
export function createApiClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookiesToSet) {
          const serialised = cookiesToSet.map(({ name, value, options }) =>
            serialize(name, value, options as SerializeOptions)
          );

          // Append to any Set-Cookie already on the response — do not clobber.
          const existing = res.getHeader("Set-Cookie");
          const prior = Array.isArray(existing)
            ? existing
            : existing
            ? [String(existing)]
            : [];

          res.setHeader("Set-Cookie", [...prior, ...serialised]);
        },
      },
    }
  );
}

/**
 * Guard for protected API handlers. Resolves the current user with a single
 * getUser(). Returns the user, or writes a 401 JSON response and returns null.
 *
 * Usage at the top of each protected handler:
 *   const user = await requireUser(req, res);
 *   if (!user) return;
 *
 * Fails closed: any error resolving the session is treated as unauthenticated.
 */
export async function requireUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<User | null> {
  const supabase = createApiClient(req, res);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }

    return user;
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
}
