# Issue 77343 reproduction

This minimal App Router page preserves the `with-strict-csp` example's reported synchronous `headers().get('x-nonce')` call. `node verify.mjs` starts the development server, requests the page, and exits 0 only when the reported runtime diagnostic is observed.
