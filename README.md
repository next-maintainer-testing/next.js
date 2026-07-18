# Next.js issue 86785 reproduction

This minimal App Router application checks the built production page and every JavaScript asset that its HTML causes a browser to request. The verifier reports the issue when Next.js sends a framework polyfill asset containing legacy JavaScript polyfills that are unnecessary for the documented supported browsers.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
