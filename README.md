# Next.js issue 44482 reproduction

This app sends a request to `foobar.localhost` through middleware and redirects it to the same port on `localhost`. The verifier checks whether the response incorrectly emits the relative `Location: /signin?domainKey=foobar` header instead of the absolute localhost URL.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
