# Next.js issue 56262 reproduction

This minimal App Router project reproduces the reported development-server behavior: a client component that calls `useSearchParams()` still renders on the server, where direct access to `window` throws `ReferenceError: window is not defined`.

Run `node verify.mjs`. Exit code 0 means the reported symptom was observed; 1 means it was absent; any other code means verification failed.
