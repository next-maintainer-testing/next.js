# Next.js issue 44994 reproduction

This app imports a Server Component with `await import()`. The imported component uses a CSS Module. `verify.mjs` builds and serves the app, requests `/test`, and verifies whether the CSS Module used by the rendered target is delivered by the page's linked stylesheets.
