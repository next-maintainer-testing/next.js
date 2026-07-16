# Next.js issue 77715 reproduction

This minimal app reproduces the Turbopack instrumentation failure reported in vercel/next.js#77715. It uses the reporter's `instrumentation.ts` pattern: `@lmnr-ai/lmnr` is dynamically imported only when `NEXT_RUNTIME` is `nodejs`.

Run `node verify.mjs`. Exit 0 means the reported invalid worker-module filename error occurred; exit 1 means the app served successfully without that error.
