# Next.js issue 54911 reproduction

This app places a localized `not-found.js` under `app/[lng]` and uses the reported `/test` base path. The verification requests an unmatched localized URL and reports the bug when the localized marker is absent from the 404 response.

Run `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
