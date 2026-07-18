# Next.js issue 52579 reproduction

This app places `apple-icon.png` at `app/icons/apple-icon.png`. The verifier builds and starts the production app, requests `/`, and reports the bug when the rendered HTML omits an `apple-touch-icon` link for that nested icon.

Run with `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and 2 means verification failed.
