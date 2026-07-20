# Next.js issue 42461 reproduction

The root layout renders an `<esi:include>` custom element. `verify.mjs` starts the app, runs the response through a small ESI-like replacement proxy, opens the transformed page in Chromium, and exits 0 only when the browser reports the hydration failure described in the issue.

Run with `npm install && node verify.mjs`.
