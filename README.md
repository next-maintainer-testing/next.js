# Next.js issue 78156 reproduction

This minimal app configures the `yak-swc` plugin through `next-yak`, which supplies its absolute `require.resolve()` path to `experimental.swcPlugins`. Run `node verify.mjs` to check whether Turbopack rejects that absolute path.
