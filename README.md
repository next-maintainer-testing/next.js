# Next.js issue 78509 reproduction

This minimal app wraps Next.js with `@sentry/nextjs` 9.14.0 and starts Turbopack while `docker-data/postgres` is unreadable. The verifier passes only when Next.js reports the permission-denied Turbopack instrumentation failure from the issue.

Run `npm install`, then `node verify.mjs` as a user allowed to change this checkout's mode bits (the verifier drops the dev server to an unprivileged UID when invoked as root).
