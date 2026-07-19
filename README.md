# Next.js issue 60956 reproduction

Minimal App Router application configured with `basePath: '/test'`. The verification script starts Next.js behind a small HTTP reverse proxy and checks the reported routing response through the proxy.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
