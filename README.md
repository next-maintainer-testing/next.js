# Next.js issue 52165 reproduction

The App Router page imports a server module that logs the prior value of a `global` property before initializing it to `hello`, matching the reported singleton pattern. The verifier starts `next dev` and repeatedly performs full page reloads. It reports the bug when later reloads repeatedly re-evaluate the imported module with the global property missing again.

Run with `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means the global survives or the module remains cached; any other code means verification failed.
