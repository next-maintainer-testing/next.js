# Next.js issue 72541 reproduction

This minimal App Router application has a parallel `@modal` slot and an intercepted `/photo/[id]` route. The verifier opens a missing route, confirms the 404 response, clicks the persistent Next.js link, and detects the reported `initialTree is not iterable` client exception.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom occurred; 1 means it did not; any other code means verification failed.
