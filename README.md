# Next.js issue 80879 reproduction

This minimal App Router page awaits in `generateMetadata()` and then calls `redirect()`, while the page itself renders normally. The verifier requests the page with a browser user agent and detects the reported Next.js 15 behavior: an HTTP 200 response containing a client-side metadata redirect instruction instead of an HTTP 307 response.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other code means verification failed.
