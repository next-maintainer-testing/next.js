# Next.js issue 27547 reproduction

This app renders `next/image` with the reporter's fixed-pixel `sizes` expression. The verifier starts Next.js, fetches the server-rendered page, and reports the bug when the image `srcset` still advertises the unreachable 3840w candidate.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent; any other code means verification failed.
