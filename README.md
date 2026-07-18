# Intercepted route metadata reproduction

Minimal reproduction for vercel/next.js issue #72938. Run `npm install`, then `node verify.mjs`. The verifier exits 0 when client navigation opens the intercepted modal but leaves the root document title unchanged.
