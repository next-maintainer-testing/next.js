# Next.js issue 62920 reproduction

This App Router page fetches a product with a one-second revalidation interval. The verifier first serves the product from a local API, then changes that API response to 404 after the cached response becomes stale. The symptom is present when Next.js continues serving the old product instead of the 404 page after repeated revalidation opportunities.

Run `npm install` and `node verify.mjs`.
