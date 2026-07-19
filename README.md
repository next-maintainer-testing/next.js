# Next.js issue 71859 reproduction

This minimal App Router application calls a function prop from a module-level `use cache` scope. The verifier starts `next dev`, requests `/?foo=bar`, and checks for the reported misleading temporary Client Reference error.

Run with `npm install && node verify.mjs`. Exit code 0 means the symptom occurred; 1 means it was absent.
