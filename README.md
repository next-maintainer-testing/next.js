# Next.js issue 67036 reproduction

This app reproduces a deployed reverse-proxy request: an HTTP Next.js server receives `x-forwarded-proto: https`, and middleware fetches an API route through `request.nextUrl.origin`. The check passes only when that fetch reports `ERR_SSL_WRONG_VERSION_NUMBER`.

Run `npm install` and `node verify.mjs`.
