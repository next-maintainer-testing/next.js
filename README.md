# Next.js issue 78070 reproduction

This minimal App Router page has no route handler. `node verify.mjs` starts `next dev` and sends an unsupported JSON `POST` to `/`. Exit code 0 means the bug is present (HTTP 200 with the page HTML); exit code 1 means it is absent.
