# Next.js issue 11016 reproduction

This minimal Pages Router app exports a `getStaticPaths` route whose segment contains spaces. Run `node verify.mjs`; exit 0 means the exported route name contains `%20` (the reported bug), while exit 1 means the route is exported with literal spaces.
