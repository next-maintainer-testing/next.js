# Issue 83573 reproduction

This minimal app reproduces the runtime failure reported in vercel/next.js#83573. It configures a custom cache handler using the reporter's relative `cacheHandler` path in `next.config.ts`.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported missing `.next/cache-handler.mjs` runtime error occurred; exit 1 means it did not.
