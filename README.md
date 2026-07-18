# Next.js issue 50561 reproduction

This minimal app enables TypeScript `strict` and `exactOptionalPropertyTypes`, then forwards an optional `onClick` handler to `next/link`. Run `node verify.mjs`; exit 0 means the reported TS2375 diagnostic is present and exit 1 means it is absent.
