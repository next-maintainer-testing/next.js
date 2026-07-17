# Next.js issue 66672 reproduction

This minimal App Router application renders a server-action form on `/contact`. The verifier compares the form produced by a client-side `<Link>` navigation with a direct load.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported malformed client-navigation form was observed; exit code 1 means it was absent.
