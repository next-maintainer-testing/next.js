# Next.js issue 54012 reproduction

This Pages Router app statically imports a deliberately large animated PNG and renders it with `next/image` without requesting a blur placeholder.

Run `npm install` and `node verify.mjs`. The verifier performs a production Webpack build and exits 0 when the full animated PNG is embedded as a base64 blur data URL in a browser JavaScript chunk, 1 when it is absent, and 2 if verification fails.
