# Next.js issue 84402 reproduction

This minimal App Router page renders a native image URL with two query parameters. `node verify.mjs` fetches the raw server-rendered HTML and reports the issue when React serializes the separator as `&amp;`.
