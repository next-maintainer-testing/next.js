# Reproduction for vercel/next.js #53117

This app caches two independent upstream values under `tag1` and `tag2`. A single route handler calls `revalidateTag` for both tags. `node verify.mjs` builds and starts the app, primes both entries, invokes that handler, and checks whether both entries changed.

The verifier exits 0 when at least one tagged entry incorrectly remains cached, 1 when both are revalidated, and another code if the check itself cannot complete.
