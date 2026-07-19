# Reproduction for vercel/next.js #76592

This App-Router-only project builds with React 18. The verifier checks whether the build nevertheless emits a Pages Router `/_error` client bundle.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
