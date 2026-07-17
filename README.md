# Next.js issue 81111 reproduction

This minimal package checks the version recorded in Next.js's compiled `@babel/runtime` package. The reported symptom is present only when that bundled package reports version `7.22.5`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported version is present, 1 means it is absent, and any other code means the check failed.
