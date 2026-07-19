# Next.js issue 57704 reproduction

This app combines a legacy Pages Router route with an App Router route under a locale segment while `i18n` is enabled in `next.config.js`.

Run `npm install` and `node verify.mjs`. The check exits 0 when `/en/about` incorrectly returns 404, 1 when the App Router page renders, and 2 if verification fails.
