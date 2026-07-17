# Parallel-route router-state header reproduction

This minimal Next.js app has two parallel slots. `verify.mjs` navigates between pages with a unique query marker and counts that marker in the actual browser-generated `Next-Router-State-Tree` request header. The reported bug is present when the same query marker occurs more than once in one header.

Run `npm install`, then `node verify.mjs`.
