# Next.js issue 62675 reproduction

A minimal App Router reproduction of the reporter's Page A sequence: its Link click first adds `/c` with `window.history.pushState()`, then navigates to `/a`. The verifier presses browser Back and checks whether the URL returns to `/c` while the rendered page incorrectly remains Page A instead of Page C.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the stale-page symptom is present; exit code 1 means it is absent.
