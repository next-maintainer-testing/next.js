# Next.js issue 65160 reproduction

This minimal App Router page server-renders a component loaded with `next/dynamic`. Its parent consumes a React context whose provider updates in `useEffect`, matching the reported hydration-time update. The dynamic loader is briefly delayed in the browser so the hydration race is deterministic.

Run `npm install`, then `node verify.mjs`. The verifier exits 0 when the server-rendered dynamic DOM is removed and the red loading fallback is inserted during hydration, 1 when that flicker is absent, and 2 on an infrastructure/check failure.
