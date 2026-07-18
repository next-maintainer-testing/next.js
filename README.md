# Next.js issue 80071 reproduction

This minimal Pages Router app defines `pages/cms/[slug].js` with `getStaticPaths()` returning `paths: []` and `fallback: false`. In development, `/cms/test` should return 404. The verifier reports the bug only when the page component instead renders without the props from `getStaticProps()`.

Run `npm install`, then `node verify.mjs`.
