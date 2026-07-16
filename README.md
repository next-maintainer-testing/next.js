# Next.js issue 51648 reproduction

This app directly checks the reported intercepting-route behavior. It hard-loads `/search?q=initial`, then uses `router.replace()` to change only the query string. The check reports the symptom when the intercepted search modal appears over the already loaded full search page.

Run `node verify.mjs`; exit 0 means the reported symptom is present, exit 1 means absent, and any other exit code means the check failed.
