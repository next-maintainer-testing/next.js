# Issue 61882 reproduction

This minimal app checks whether `next dev` reports a newly introduced Prettier/ESLint error. The verifier starts the dev server with valid source, edits the page to add a lint violation, confirms the violation independently with ESLint, and then checks the dev-server terminal output and rendered response for the diagnostic.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom (no automatic lint diagnostic from `next dev`) is present; exit code 1 means it is absent.
