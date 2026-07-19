# Issue 52329 reproduction

This minimal App Router application calls `notFound()` from `generateMetadata()` in a dynamic locale segment. The root and locale `not-found.js` files emit distinct markers so `verify.mjs` can detect whether the wrong root boundary was rendered.

Run `node verify.mjs`. Exit code 0 means the reported bug is present; exit code 1 means the locale boundary was rendered; any other code means verification failed.
