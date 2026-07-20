# Next.js issue 60030 reproduction

This minimal Pages Router app wraps a function-form `next.config.js` with `@next/mdx`. The config requests `output: 'export'`. Run `node verify.mjs`; exit 0 means `next build` succeeded without creating `out`, while exit 1 means the static export directory was created.
