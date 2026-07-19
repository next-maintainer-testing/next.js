# Next.js issue 71197 reproduction

This Pages Router app uses `trailingSlash: true`, a slash-containing build ID, middleware, and a dynamic product route. The verifier compares middleware behavior on the initial document request with the Next data request used by client navigation.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
