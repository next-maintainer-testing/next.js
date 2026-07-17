# Next.js issue 82775 reproduction

This standalone App Router app configures `experimental.staleTimes` with a 5-second dynamic lifetime and a 20-second static lifetime. The verifier builds and starts the production app, prefetches the dynamic route, waits longer than the dynamic lifetime but less than the static lifetime, and checks whether hovering again sends a fresh RSC request.

Run `npm install && node verify.mjs`. Exit code 0 means the reported stale dynamic prefetch is present; exit code 1 means it refreshed as expected.
