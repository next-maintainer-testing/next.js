# Next.js issue 83278 reproduction

This minimal App Router project opens `/signin` through an intercepted parallel route. The modal slot has a catch-all route returning `null`, so a client navigation back to `/` should dismiss the modal.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported stale-modal symptom occurred; exit 1 means it was absent.
