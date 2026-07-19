# Next.js issue 77759 reproduction

This minimal App Router project reproduces the delayed Suspense commit reported in vercel/next.js#77759. It starts on a timeout-backed route, transitions to a server component using `fetch`, and measures the browser-console timestamps between rendering the resolved client child and unmounting the fallback.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported delay (at least 150 ms) was observed; exit 1 means it was absent.
