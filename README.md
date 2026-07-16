# Next.js ISR stale noindex reproduction

This minimal App Router application reproduces issue vercel/next.js#71440. The verifier starts a local post backend plus a production Next.js server, first renders an ISR post while its backing status is `DRAFT` (a 404), changes the status to `PUBLISHED`, waits for revalidation, and checks whether the regenerated successful HTML incorrectly retains the injected robots `noindex` metadata.

Run the machine check with `node verify.mjs`. Exit 0 means the reported stale-noindex symptom is present; exit 1 means it is absent.
