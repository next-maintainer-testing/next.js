# Next.js issue 76499 reproduction

This minimal App Router page passes the `searchParams` promise from a server page to a client component, where React `use()` unwraps it. On the reported version, requesting `/` logs an erroneous synchronous dynamic API warning for `searchParams._debugInfo`.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means it was absent.
