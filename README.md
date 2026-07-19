# Next.js issue 74916 reproduction

This minimal app reproduces the middleware-size discrepancy reported in vercel/next.js#74916. The middleware's build summary and executable files remain below the 1 MiB Hobby-plan limit, while the deployable edge-function package crosses that limit once its generated source maps are included.

Run `npm ci` and `node verify.mjs`. Exit code 0 means the discrepancy is present, 1 means it is absent, and any other code means verification failed.
