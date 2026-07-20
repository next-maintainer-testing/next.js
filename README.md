# Issue 73046 reproduction

Minimal reconstruction of the `with-next-translate` example as it existed when the issue was reported. The localized page exists at `/en`, while requesting `/` in `next dev` returns the reported 404 instead of the sample screen.

Run `npm install`, then `node verify.mjs`. Exit 0 means the root-page 404 reproduced; exit 1 means it did not.
