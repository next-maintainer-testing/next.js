import { NextResponse } from "next/server";

export async function middleware(request) {
  if (request.nextUrl.pathname === "/slow") {
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/slow"],
};
