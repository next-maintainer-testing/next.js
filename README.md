# Next.js issue 56229 reproduction

This minimal App Router project configures `basePath: '/app'`. Its route handler at `/app/route` calls `redirect('/home')`; the verifier checks whether the resulting `Location` incorrectly omits `/app`.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present, exit 1 means it is absent, and any other exit code means the check failed.
