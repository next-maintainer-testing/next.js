# Next.js issue 70580 reproduction

This app imports `next/font/local` from a small TypeScript library compiled to CommonJS before `next build`. On affected Next.js versions, the compiled default import throws `TypeError: (0, x.default) is not a function` while collecting page data.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
