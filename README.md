# Next.js issue 69567 reproduction

The root layout installs an inline `beforeInteractive` script. The verifier builds and starts the production app, checks that the script executes on `/`, then directly loads `/pl/newsite`, whose page calls `notFound()`. Exit 0 means the reported symptom is present: the control executes the script but the `notFound()` response does not.

Run with `npm install` followed by `node verify.mjs`.
