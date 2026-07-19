# Next.js issue 76168 reproduction

This minimal App Router application rewrites `/example` to `/404`. In the reported behavior, the production response has no explicit `Cache-Control` header.

Run `node verify.mjs`. Exit code 0 means the response reached the custom not-found page and omitted `Cache-Control`; exit code 1 means the symptom was absent.
