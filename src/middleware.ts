import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path !== "/add") return NextResponse.next();

  const bundle = createSupabaseMiddlewareClient(request);
  if (!bundle) return NextResponse.next();

  const {
    data: { user },
  } = await bundle.supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  const { data: contributor } = await bundle.supabase
    .from("contributors")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contributor) {
    const join = new URL("/join", request.url);
    join.searchParams.set("next", path);
    return NextResponse.redirect(join);
  }

  return bundle.response;
}

export const config = {
  matcher: ["/add"],
};
