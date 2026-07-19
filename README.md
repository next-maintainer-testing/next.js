# Next.js issue 51477 reproduction

This minimal App Router page renders an `async` Server Component that calls React `use()` on a promise. The reported failure is the runtime error `Expected a suspended thenable` when requesting the page.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported error occurred; exit code 1 means the page rendered normally.
