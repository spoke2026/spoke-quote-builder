import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * The perimeter. Every matched request must carry a valid Supabase session,
 * except the sign-in screen at /login and the public customer share endpoint.
 *
 * Fails CLOSED on both failure modes:
 *   (a) Supabase env missing → 503 for ALL paths (including /login, so there is
 *       no redirect loop). The app never opens without its config.
 *   (b) Any error resolving the session, or an absent session → treated as no
 *       user. Pages redirect to /login; /api requests get a 401 JSON.
 *
 * The allow/deny decision lives here and only here. updateSession performs a
 * single getUser() and returns { response, user }; this function acts on it.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // (1) Fail closed on missing env — before touching updateSession.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return new NextResponse("Service unavailable", { status: 503 });
  }

  // (2) Public customer share links must stay open with no session. The token
  //     has no file extension so the matcher would otherwise gate it, breaking
  //     every existing customer quote link. Bypass before resolving a session.
  if (pathname.startsWith("/api/quotes/share/")) {
    return NextResponse.next();
  }

  // (3) Single getUser(), carrying refreshed auth cookies on the response.
  const response = NextResponse.next({ request });
  const { response: sessionResponse, user } = await updateSession(
    request,
    response
  );

  // (4) The sign-in screen is always reachable (session-refreshed).
  if (pathname === "/login") {
    return sessionResponse;
  }

  // (5) No user (absent or errored session) → deny.
  if (!user) {
    // API callers get a clean 401 JSON, not an HTML redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Page requests redirect to the sign-in screen.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // (6) Valid session → allow, keeping the refreshed cookies.
  return sessionResponse;
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     *   - _next/static, _next/image (framework assets)
     *   - favicon.ico
     *   - anything with a file extension (e.g. .svg, .png, .jpg, .ico, .css)
     * This prevents gating static assets and avoids redirect loops on them,
     * so /login can render its logo and styling.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};
