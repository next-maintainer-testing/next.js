# Next.js issue 50659 reproduction

This minimal App Router application calls a Server Action from a Client Component, while middleware intercepts the action POST with a plain-text 401 response. `verify.mjs` invokes Next.js's actual client Server Action reducer with that intercepted response and observes whether the action promise incorrectly resolves to `undefined` instead of rejecting.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent; any other code means the check failed.
