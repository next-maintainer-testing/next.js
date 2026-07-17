# Next.js issue 82559 reproduction

This minimal app exercises `light-dark()` in a CSS custom property without declaring `color-scheme`, matching the reported Turbopack development-mode failure. `node verify.mjs` launches `next dev --turbopack`, fetches the runtime stylesheet, and checks whether the row background becomes invalid at computed-value time (rendering transparent over white) instead of light gray.
