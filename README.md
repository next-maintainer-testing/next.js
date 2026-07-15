# Next.js issue #68868 reproduction

This reproduces the reported missing `next/typescript` ESLint configuration in Next.js 14.2.1. Install dependencies and run `npm run verify`.

The check exits 0 when the matching `eslint-config-next` package cannot resolve `eslint-config-next/typescript` (bug present), 1 when it resolves (bug absent), and 2 if setup or version matching is invalid.
