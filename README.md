# Reproduction for vercel/next.js #63195

This standalone App Router page navigates through `next/link` with query parameters in `href` and a query-free `as` path. The destination renders its observed `searchParams.sourcePage`. `node verify.mjs` performs the client navigation and exits 0 when the reported missing-parameter symptom occurs, 1 when the parameter is preserved, and 2 if verification cannot complete.
