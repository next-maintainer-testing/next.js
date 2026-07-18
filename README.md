# Next.js issue 81298 reproduction

This minimal production App Router application checks timed ISR together with the client router's stale-time expiry. It first visits an ISR page through `Link`, leaves it, waits for the two-second static router-cache stale time, and returns with browser history. The check then revisits through `Link` and compares the rendered generation timestamps.

Run `npm install` followed by `node verify.mjs`. Exit 0 means browser history kept the stale ISR payload while `Link` obtained the newer payload; exit 1 means that symptom is absent.
