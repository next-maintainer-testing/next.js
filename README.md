# Next.js issue 84944 reproduction

This minimal App Router application mirrors the reported multi-tenant route: middleware rewrites `kek.localhost` to a dynamic segment whose page exports `dynamic = 'force-static'` and `revalidate = 1000`, then reads tenant-like data with a non-cached HTTP request. The verifier builds and starts Next.js, makes repeated requests through the subdomain rewrite, and reports response cache headers. Exit code 0 means the second response was not a cache hit, reproducing the reported missing ISR cache behavior.

Run with `npm install && node verify.mjs`.
