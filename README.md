# Issue 78948 reproduction

This reproduces the reporter's linked setup: `middleware.ts` is at the project root beside the root `app` directory. The verifier starts `next dev`, requests the page, and reports the claimed symptom when Next.js compiles and runs that middleware without an invalid-location diagnostic.

Run `npm install` and then `node verify.mjs`.
