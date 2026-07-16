# Next.js issue 65335 reproduction

This minimal App Router application has two category pages that link to the same product. The verifier builds and starts the production app, follows the product link from each category in a real Chromium browser, and records the actual RSC navigation request. It reports the issue when the identical product payload is requested with different `_rsc` query hashes depending on the source category.

Run with `node verify.mjs`. Exit code 0 means the symptom is present, 1 means it is absent, and any other exit code means verification failed.
