# Next.js issue 68272 reproduction

The `/mypage` route declares `canonical: './?someparams=true'` with `metadataBase` set to `https://example.com`. The verifier starts Next.js, requests the route, and checks whether the rendered canonical link incorrectly contains a slash before the query string.

Run with `npm install && node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
