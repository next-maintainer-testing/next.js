# Next.js issue 82787 reproduction

This minimal App Router project reproduces the parent-page chunk leak reported in vercel/next.js#82787. The root layout and root page both import `next/script`; the child page does not. A production request to `/child` should not load JavaScript unique to the parent `/page` route.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
