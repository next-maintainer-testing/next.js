# Next.js issue 73087 reproduction

This minimal app has a root Babel configuration and enables `experimental.forceSwcTransforms`. The verifier starts `next dev --turbopack` and reports the bug only when Next.js refuses to start with the unsupported Babel/`forceSwcTransforms` diagnostic described in the issue.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent; exit code 2 means verification failed.
