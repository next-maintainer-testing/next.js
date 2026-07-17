# Next.js issue 76317 reproduction

A server component renders a React stylesheet resource with a nonce. `node verify.mjs` requests the raw SSR HTML and reports whether the transformed style tag drops that nonce.
