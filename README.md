# Next.js issue 62678 reproduction

This Pages Router app delays the `/about` JavaScript route chunk beyond Next.js's route-loader timeout. `node verify.mjs` builds and starts the app, drives Chromium over CDP, clicks the route button, and exits 0 only when the browser reports `Route did not complete loading`.
