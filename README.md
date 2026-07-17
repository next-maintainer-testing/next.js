# Reproduction for vercel/next.js #83865

This app inherits `dynamic = "force-static"` and `revalidate = 86400` from its root layout. The verifier performs a compile build followed by `generate-env`, starts the production server, requests an unknown dynamic route, and checks its actual `cache-control` response header.

Run with `npm install` and `node verify.mjs`. Exit code 0 means the reported private/no-cache header is present; exit code 1 means an ISR `s-maxage` header is present; any other exit code means verification failed.
