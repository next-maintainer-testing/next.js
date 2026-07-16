# Next.js issue 76019 reproduction

This minimal App Router project reproduces the catch-all parameter bug from the reporter's StackBlitz project. Run `npm install`, then `node verify.mjs`. The check requests `/top-level/foo/var` and exits 0 when the parallel route receives the incorrect full-path segments.
