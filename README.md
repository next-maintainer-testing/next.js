# Next.js issue 75374 reproduction

This minimal App Router project calls a server action while a Client Component renders and consumes its cached promise with React `use`. Run `node verify.mjs` to check for the reported Router render-update console error.
