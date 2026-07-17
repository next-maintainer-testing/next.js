# Next.js issue 61908 reproduction

This minimal App Router page reproduces the incorrect `next/image` warning when both numeric dimensions are supplied but the aspect-ratio-derived height is fractional.

Run `npm install` and `node verify.mjs`. Exit code 0 means the browser emitted the reported warning; exit code 1 means it did not.
