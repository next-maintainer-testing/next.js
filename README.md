# Next.js issue 66352 reproduction

This app configures `Access-Control-Allow-Origin: *` for every path and exposes `/something`. The verifier confirms the header is present on `/something`, then checks whether Next.js omits it from the automatic trailing-slash redirect at `/something/`.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported missing-header symptom is present; exit code 1 means it is absent.
