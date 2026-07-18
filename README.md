# Static RSC ETag reproduction

Minimal reproduction for vercel/next.js#80452. `node verify.mjs` builds and starts the static App Router page, requests its RSC payload twice, and reports the bug when the prerendered RSC response has no ETag and remains HTTP 200.
