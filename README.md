# Next.js issue 62256 reproduction

This minimal App Router page starts a real browser Web Worker and reports both `typeof window` and direct `window` access from inside that worker. The verifier launches Next.js in development mode and a headless Chromium browser. It exits 0 only when the reported symptom (`typeof window === "object"`) occurs, 1 when `window` correctly remains undefined, and 2 if verification itself fails.
