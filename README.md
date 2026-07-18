# Next.js issue 67285 reproduction

This minimal App Router project reproduces the reported build-time failure when a Client Component manually suspends on a browser-relative fetch during render.

Run `npm install`, then `node verify.mjs`. The verifier succeeds only when `next build` evaluates the suspended Client Component during prerendering and reports that `window` is not defined.
