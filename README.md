# Next.js issue 75762 reproduction

Clicking the link redirects from a React Server Component to an intercepted route. `verify.mjs` launches the app, clicks that link in Chromium, and reports the bug only when the intercepted server component repeatedly renders.
