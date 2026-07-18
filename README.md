# Next.js issue 66244 reproduction

This minimal App Router project has an async page and a route `loading.js`. The verifier requests the server HTML without executing JavaScript and detects whether the completed SSR page is emitted inside a `hidden` container while the loading fallback remains visible.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means absent.
