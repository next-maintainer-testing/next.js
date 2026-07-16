# Next.js issue 87068 reproduction

This app checks an Edge Runtime page at `/test/homepage` whose route is `app/test/[[...slug]]/page.js`. The page reports whether the awaited `params` object contains the expected `slug` array.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported missing-slug symptom occurred, exit 1 means the slug was present, and any other exit code means the check failed.
