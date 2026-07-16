# Next.js issue 71604 reproduction

A middleware rewrite adds a response header, replaces an upstream response header, and removes another upstream response header. Request `/proxy`: the bug is present when the added header appears but the upstream values win for the replacement and removal.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means replacing and removing headers worked; any other exit code means the check failed.
