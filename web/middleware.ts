import { NextRequest, NextResponse } from "next/server";
import { authToken } from "@/lib/auth";

// Everything except the login page/API and static assets requires the password cookie.
export async function middleware(req: NextRequest) {
  const expected = await authToken();
  const got = req.cookies.get("td_auth")?.value;
  if (expected && got === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
