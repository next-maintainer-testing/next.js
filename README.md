# Next.js issue 55691 reproduction

This Pages Router app models the production routing metadata added by a platform proxy for a dynamic catch-all route. The verifier builds and starts Next.js, confirms the catch-all JSON data route normally returns 200, then sends the same prefetch data request with `x-now-route-matches`. The reported symptom is a 404 response for that existing page data route.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the 404 symptom is present; 1 means the proxied prefetch succeeds; any other code means verification failed.
