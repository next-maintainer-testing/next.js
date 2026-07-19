# Reproduction for vercel/next.js #76323

This app compares two otherwise equivalent dynamic `opengraph-image.tsx` routes during `next build`:

- `control/[slug]` exports `generateStaticParams`.
- `with-metadata/[slug]` also exports `generateImageMetadata`.

Each convention records when its image renderer runs. `verify.mjs` reports the issue only when the control image is prerendered but the image with `generateImageMetadata` is not. The issue did not include an exact package version, so this reconstruction uses Next.js 15.1.7, the stable release current when the issue was filed, with React 19.0.0.
