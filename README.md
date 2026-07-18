# Next.js issue 79562 reproduction

This app renders the `output` configuration reference from the exact installed Next.js tag. The verifier checks the rendered article for the reported omission: it documents `output: 'standalone'` but not the other accepted value, `output: 'export'`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the omission is present; 1 means it is absent.
