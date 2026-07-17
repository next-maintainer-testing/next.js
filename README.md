# Next.js issue 81124 reproduction

A redirect to `https://www.example.com/#/login?return=something` is configured at `/redirect`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported `Unexpected MODIFIER` runtime failure occurred; exit code 1 means the redirect worked; any other code means verification failed.
