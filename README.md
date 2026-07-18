# Next.js issue 31009 reproduction

This app uses the reported two-statement Web Worker construction pattern. The verifier builds and starts Next.js, requests the emitted `.ts` worker asset, and reports the bug only when the server returns the non-executable `video/mp2t` MIME type.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means absent; exit 2 means verification failed.
