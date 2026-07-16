# Next.js issue 62049 reproduction

This minimal App Router page reproduces the reporter's two independent async Suspense boundaries. The second boundary is keyed by `searchParams`. Clicking **Update Query Params** should show its fallback immediately while its server component rerenders; the reported bug keeps the old content visible and delays the URL update instead.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported missing-fallback symptom was observed; exit code 1 means the fallback appeared; any other code means verification failed.
