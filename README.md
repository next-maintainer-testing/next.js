# Issue 84198 reproduction

This minimal App Router project compares repeated requests to `/` and `/123456`. Both pages invoke the same React Server Function. The verifier reports the issue only when refreshing the dynamic route unexpectedly re-evaluates the shared module with missing global state while refreshing `/` does not.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent; any other code means the check failed.
