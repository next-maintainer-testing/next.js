# Next.js issue 93905 reproduction

This minimal development-mode app checks client interactivity after a regular document navigation to another Next.js route and browser Back. The verifier requires the restored document to come from Chromium's HTTP cache, then clicks a React counter to distinguish the reported hydration freeze from working behavior.

Run `npm install`, then `node verify.mjs`. Exit 0 means the freeze is present; exit 1 means interactivity survives; another exit code means the check could not obtain valid evidence.
