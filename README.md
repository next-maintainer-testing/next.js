# Next.js issue 76930 reproduction

A minimal reproduction of the clean `next build` failure reported in vercel/next.js#76930. It combines an App Router edge-runtime layout with Vanilla Extract. `node verify.mjs` removes `.next`, runs the production build, and reports the specific duplicate `middleware-manifest.json` asset conflict.
