import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "pabbar_session";
const PUBLIC_PATHS = ["/", "/login"];
// The invite page shows who invited you before you sign in.
const PUBLIC_PREFIXES = ["/invite/"];

// Cheap optimistic gate on cookie presence. Real validation happens
// server-side via getSession() (the /login page redirects signed-in users,
// so a stale cookie can never cause a redirect loop).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    request.cookies.has(SESSION_COOKIE)
  ) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
