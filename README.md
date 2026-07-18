# Next.js issue 80186 reproduction

This app runs `require.resolve('highlight.js')` in a server route under `next dev --turbopack`. The verifier reports the bug only when Next.js returns a synthetic path containing `[project]` that does not exist on disk.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
