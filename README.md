# Next.js issue 76047 reproduction

The App Router page imports CSS containing `url('~@/public/asset.svg')`. The `@/*` TypeScript path maps to `./*`, and the SVG exists, but `next dev --turbopack` reports that it cannot resolve the URL on Next.js 15.1.7.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported resolution failure was observed; exit 1 means the page compiled; another exit code means the check itself failed.
