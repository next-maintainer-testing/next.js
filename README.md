# Next.js issue 59052 reproduction

This minimal App Router application applies the nonce-based Content Security Policy middleware from the Next.js documentation. The verifier builds and starts the production application, requests the page, and reports the bug only when the response CSP contains a nonce but none of Next.js's generated script tags carry that nonce.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
