# Next.js issue 83957 reproduction

This minimal App Router page hydrates a client component, then `verify.mjs` reads the browser Performance API. The reported symptom is present when hydration succeeds but the `Next.js-before-hydration` user timing measure described in vercel/next.js#8069 is absent.

Run `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means the timing measure exists.
