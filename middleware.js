export function middleware(request) {
  console.log({ HOST: request.headers.get("host"), PATH: request.nextUrl.pathname });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
