# Next.js issue 65568 reproduction

This minimal app exposes the `NextRequest.url` and `NextRequest.nextUrl.href` values from middleware as response headers. `verify.mjs` starts Next.js on internal port 3000, sends `/observe` with the external `Host: public.example.test:3002`, and reports the bug when both URL values still use the internal host and port.
