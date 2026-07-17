# Next.js issue 80050 reproduction

This minimal App Router project reproduces the reporter's optional catch-all route returning HTTP 404 after a `NODE_ENV=test next build` with experimental Dynamic IO enabled.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the erroneous 404 was observed; exit code 1 means the front page rendered normally.
