# Next.js issue 59180 reproduction

This minimal App Router project has two route groups, each with its own root layout and `not-found.js`. Requesting an unmatched URL from the main route produces Next.js's generic 404 instead of the main group's custom not-found UI.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported generic-404 symptom is present; exit 1 means the custom UI rendered.
