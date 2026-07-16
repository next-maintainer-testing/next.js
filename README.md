# Next.js issue 74249 reproduction

This minimal App Router page compares keyboard navigation after activating a native hash anchor and a `next/link` hash link. Run `node verify.mjs`; exit code 0 means the reported tab-order symptom is present, 1 means it is absent, and any other code means the check failed.
