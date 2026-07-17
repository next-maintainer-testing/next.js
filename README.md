# Next.js issue 85071 reproduction

This minimal app verifies that `next dev` logs a JSON parse error when the hard-coded npm registry returns a corporate-firewall HTML page, even though `.npmrc` points to an available registry.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom was observed; exit 1 means it was absent.
