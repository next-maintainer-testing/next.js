# Next.js issue 75372 reproduction

The fixture runs a Webpack development server from `.git-projects/app`, changes the rendered marker, and checks whether subsequent HTTP responses reflect the edit. `node verify.mjs` exits 0 when the stale-output symptom is present and 1 when Webpack notices the change.
