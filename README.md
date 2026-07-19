# Next.js issue 59997 reproduction

This minimal app runs `next build` while making Node report the reporter's `freebsd/x64` platform. The verifier succeeds only when the build directly requests `@next/swc-freebsd-x64` and fails to obtain or load it.

Run with `npm install && node verify.mjs`.
