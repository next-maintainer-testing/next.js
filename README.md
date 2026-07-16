# Next.js issue 86670 reproduction

This minimal Cache Components app performs page-level authorization by awaiting `connection()` and reading cookies directly in `/test`, outside a Suspense boundary.

Run `npm install`, then `node verify.mjs`. The verifier exits 0 only when Next.js reports the `blocking-route` error for `/test`, 1 when the page renders without that symptom, and 2 if verification itself fails.
