# Next.js issue 74319 reproduction

This minimal App Router project applies the strict nonce-based `style-src` policy from Next.js's `with-strict-csp` example. The verifier opens an unknown route in Chromium and checks whether the framework's built-in 404 inline styles are blocked by CSP.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported unstyled-404 symptom is present; exit 1 means it is absent.
