# Next.js issue 47085 reproduction

This minimal Pages Router app configures `basePath: '/withbase'` and the exclusionary middleware matcher from the issue. The verifier requests both `/withbase` and `/withbase/about`: the reported bug is present when middleware runs for the nested page but silently skips the base-path root.

Run `npm install` and `node verify.mjs`.
