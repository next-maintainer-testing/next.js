# Next.js issue 49300 reproduction

A force-dynamic App Router page reads `data.json`. After two mutations and repeated client-side Link navigations, the second return can retain the first mutation's stale value.

Run `npm install`, then `node verify.mjs`. Exit 0 means the stale-value symptom occurred; exit 1 means it was absent.
