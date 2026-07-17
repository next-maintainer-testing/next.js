# Issue 83821 reproduction

Minimal reproduction of the reported `next build` type error for a dynamic App Router route handler whose `params` context is typed synchronously.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported mismatch was observed; exit code 1 means it was absent.
