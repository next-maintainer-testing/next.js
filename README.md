# Next.js issue 74188 reproduction

This app uses the `images.remotePatterns` object shown in the documentation, including `port: ''` and `search: ''`. On Next.js 14.2.5, `next dev` rejects `search` as an unrecognized key and exits before serving the page. The verification script exits 0 when that reported symptom is observed and 1 when the configuration is accepted and the page is served.

Run `npm install` and then `node verify.mjs`.
