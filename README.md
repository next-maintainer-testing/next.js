# Next.js issue 58261 reproduction

This App Router app links to a delayed route with `prefetch={false}` and a route-level `loading.js`. The verifier uses a real browser to check whether that loading UI appears promptly after the click, before the intentionally delayed request reaches the route.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported missing immediate feedback is present; exit code 1 means prompt loading feedback is present.
