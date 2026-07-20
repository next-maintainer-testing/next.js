# Next.js issue 63749 reproduction

This minimal App Router application forwards a random CSP nonce from middleware to a server-rendered inline script. The verifier opens the page in Chromium and succeeds only when the browser console reports the nonce server/client hydration mismatch described in the issue.

Run `npm install`, then `node verify.mjs`.
