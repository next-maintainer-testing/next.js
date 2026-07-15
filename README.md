# Next.js issue 78592 reproduction

This minimal app imports a WebAssembly file through `file-loader` in a Turbopack rule without an `as: '*.js'` override, matching the reported configuration.

Run `npm install` and `node verify.mjs`. The verifier exits 0 only when `next build --turbopack` fails with the reported Turbopack WASM/loader diagnostic.
