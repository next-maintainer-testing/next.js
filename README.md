# Next.js issue 66751 reproduction

This minimal App Router project reproduces local client state being reset, with the loading boundary shown, when navigating between values of an optional catch-all route.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means it was absent.
