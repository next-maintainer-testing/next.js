# Next.js issue 78113 reproduction

A Pages Router application imports a local CommonJS package which calls `require('date-fns')`. The verifier runs a Webpack production build and reports the bug only when Next.js emits the issue's exact ESM-import error for `date-fns`.

Run `npm install` and then `node verify.mjs`.
