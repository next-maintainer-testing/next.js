# Next.js issue 38273 reproduction

This app measures production requests for two identical static files. Middleware runs only for `/matched.txt`; `/baseline.txt` is the control. `node verify.mjs` exits 0 when the middleware route has a substantial repeatable latency penalty, 1 when it does not, and 2 if the check cannot run.
