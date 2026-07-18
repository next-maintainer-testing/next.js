# Next.js issue 58914 reproduction

This minimal production App Router application sends two `X-Forwarded-Proto: https` header lines to a route handler. The verifier reports the issue only when Next.js fails before entering the handler with `ERR_INVALID_URL` and a base beginning with `https, https://`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other exit code means verification failed.
