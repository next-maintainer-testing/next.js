# Next.js issue 80100 reproduction

This minimal production server exposes a file whose name contains an ampersand. Run `npm install` and `node verify.mjs`. The verifier exits 0 when the raw-ampersand URL returns 404 while the percent-encoded URL returns 200, 1 when the raw URL succeeds, and 2 if setup or observation fails.
