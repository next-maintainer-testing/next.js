# Next.js issue 63402 reproduction

This minimal App Router route returns `NextRequest.url`. The verifier sends reverse-proxy headers for `https://proxy.example.test/test` and reports the bug when Next.js constructs a different internal URL.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
