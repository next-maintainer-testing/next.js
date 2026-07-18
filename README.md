# Reproduction for vercel/next.js #78696

This minimal App Router route imports and constructs `TwitterApi`. The verifier starts `next dev --turbopack`, requests `/api/test`, and reports the bug only when the server responds with the reported `ReferenceError: Cannot access 'TwitterApiReadWrite' before initialization`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom occurred; 1 means it was absent; any other code means verification failed.
