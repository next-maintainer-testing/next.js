# Next.js issue 50860 reproduction

This minimal Pages Router app runs Next.js in development through a custom Node HTTP server with a non-empty `basePath`. The page renders a statically imported PNG with `next/image`. `node verify.mjs` checks whether the generated optimizer URL contains the base path twice and consequently returns 404.
