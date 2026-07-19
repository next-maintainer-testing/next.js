# Next.js issue 67191 reproduction

This minimal App Router project initializes a `cookies()`-dependent server helper at module scope, matching the reported pattern. Run `node verify.mjs`; exit 0 means the reported build-time request-scope error occurred, exit 1 means it did not, and any other exit code means the check failed.
