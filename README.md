# Next.js issue 84067 reproduction

This minimal app performs a production build while declaring the two lifecycle callbacks requested in the issue. Each callback creates a marker (the static-generation callback also copies a file). `node verify.mjs` reports the issue when the build succeeds but neither callback runs.
