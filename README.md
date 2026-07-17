# Next.js issue 84190 reproduction

This minimal App Router project preserves the reported synchronous `context.params` route-handler signature. Run `node verify.mjs`; exit 0 means `next build --turbopack` rejects that signature with the reported Promise-based route context type error, and exit 1 means the build accepts it.
