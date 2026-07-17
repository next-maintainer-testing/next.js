# Next.js issue 82721 reproduction

This minimal App Router project reproduces the reported build-time validation failure for a dynamic `DELETE` route whose context uses synchronous `params`.

Run `npm install`, then `node verify.mjs`. The verifier exits 0 only when `next build` reports the specific invalid `DELETE` export and second-argument type errors.
