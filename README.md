# Reproduction for Next.js issue #62697

With `output: 'export'`, `/some-page` performs a server-component `fetch` using
`cache: 'no-store'`. On the reported Next.js version, `next build` succeeds,
classifies the route as dynamic, and silently omits it from `out/`.

Run `npm install` and `node verify.mjs`. Exit 0 means that exact symptom is
present, exit 1 means absent, and any other exit code means the check failed.
