# Runtime `NEXT_PUBLIC_` environment reproduction

This minimal app reproduces vercel/next.js issue #77448. It builds a client-facing page with one `NEXT_PUBLIC_RUNTIME_VALUE`, then starts the same production build with a different runtime value.

Run `npm install` followed by `node verify.mjs`. Exit code 0 means the rendered page still exposes the build-time value instead of the runtime value; exit code 1 means the runtime value is rendered; any other exit code means verification failed.
