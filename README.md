# `use cache` build-time query reproduction

This minimal Cache Components app calls a database stand-in from a function marked with `use cache`. The verification script runs `next build` and records whether that function is executed while prerendering, modeling a build environment that must not access the database.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported build-time execution occurred; exit code 1 means it did not; other codes mean the check failed.
