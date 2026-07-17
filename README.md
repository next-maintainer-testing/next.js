# Next.js issue 61371 reproduction

A minimal App Router reproduction of a PPR-enabled intercepted `/command` route. The direct route redirects home; client navigation should render the parallel-route dialog instead.

Run `node verify.mjs`. Exit 0 means the deployed PPR prefetch causes the intercepted route to redirect rather than display the command palette.
