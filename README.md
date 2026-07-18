# Next.js issue 77864 reproduction

A minimal App Router page importing a `next-safe-action` action whose inline Zod schema contains a synchronous arrow callback. Under Turbopack in the reported version, requesting `/` produces the false-positive `Server Actions must be async functions` diagnostic.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported diagnostic occurred; 1 means the page compiled without it.
