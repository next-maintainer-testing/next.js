# Route announcer translation mutation reproduction

This minimal App Router application reconstructs vercel/next.js issue #83392. The verifier navigates to a route with a heading, replaces the route announcer's text node with an element as browser translation does, and navigates back. It passes only when the reported `removeChild` `NotFoundError` is observed.

Run with `node verify.mjs` after installing dependencies.
