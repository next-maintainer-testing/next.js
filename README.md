# Next.js issue 80319 reproduction

This minimal App Router application compares client navigation to `/hoge` with navigation to `/hoge#foo`, where `foo` does not exist. The verifier reports the bug only when ordinary navigation reaches the document top but missing-hash navigation scrolls past the shared layout to the page child.

Run `npm install`, then `node verify.mjs`.
