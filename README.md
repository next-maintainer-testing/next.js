# Next.js issue 84159 reproduction

This minimal App Router project reproduces the TypeScript IDE plugin warning emitted for a `metadata` export constrained with `satisfies Metadata`.

Run `npm install` and `node verify.mjs`. Exit code 0 means the unwanted plugin warning is present; exit code 1 means it is absent.
