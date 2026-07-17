# Next.js iframe onLoad reproduction

Minimal reproduction for vercel/next.js issue #69736. In `next dev`, it renders three client-component iframes and records whether each `onLoad` callback fired. `node verify.mjs` serves the iframe document, starts the dev server, opens the page in headless Chromium, and exits 0 only when at least one callback is missed.
