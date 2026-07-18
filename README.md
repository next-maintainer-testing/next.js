# Next.js issue 76803 reproduction

This minimal App Router app calls a throwing Server Action directly from a Client Component `onClick` handler while a nearest `app/error.js` boundary is present.

Run `npm install`, then `node verify.mjs`. The verifier exits 0 when the action rejection is unhandled and the error boundary does not render, 1 when the boundary renders, and 2 if the browser check cannot complete.
