# Next.js issue 61728 reproduction

This app logs `NEXT_RUNTIME` at module scope in `instrumentation.js`. The verifier starts `next dev`, confirms the initial Node.js instrumentation load, changes the instrumentation file, and checks whether the hot-reloaded module unexpectedly runs with the Edge runtime.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported Edge-runtime reload occurred; exit code 1 means it did not.
