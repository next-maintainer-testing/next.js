# Next.js issue 71744 reproduction

This minimal app reproduces the reported hydration error with a normal root layout plus a nested route-group layout whose `<html>` element uses a `next/font/local` variable class.

Run `npm install`, then `node verify.mjs`. Exit 0 means the browser observed the hydration mismatch, exit 1 means it did not, and any other exit means the check failed.
