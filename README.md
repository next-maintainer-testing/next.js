# Next.js issue 75114 reproduction

This standalone Pages Router app renders the same 5000×5000 image twice in 100×100 CSS boxes. The first `next/image` receives the source's intrinsic 5000×5000 dimensions; the control receives the desired 100×100 dimensions. `verify.mjs` builds and serves the app, fetches the rendered HTML, and compares the emitted `srcset` candidates.

The issue did not state a package version. This reproduction pins Next.js 15.1.5, the current stable release when the issue was filed on January 20, 2025, with React 19.0.0.
