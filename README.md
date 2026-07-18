# Next.js issue 61697 reproduction

This minimal App Router application renders a client component that calls `useSearchParams()` without a Suspense boundary. The persisted verifier runs `next build` and reports the issue only when the build fails with the missing-Suspense prerender diagnostic described in issue 61697.

Run `npm install`, then `node verify.mjs`.
