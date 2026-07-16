# Next.js issue 78302 reproduction

This minimal App Router project starts `next dev --turbopack` and serves the failing declaration order documented in the issue follow-ups: `backdrop-filter` immediately precedes `-webkit-backdrop-filter`. `node verify.mjs` inspects the CSS emitted by the running development server and reports the issue when the prefixed declaration remains but the standard declaration is absent.
