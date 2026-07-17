# Next.js issue 81374 reproduction

This minimal app compares sequential keyboard focus after activating a native hash anchor and a `next/link` hash link. Run `npm install` and `node verify.mjs`; exit 0 means the reported focus-navigation mismatch is present, while exit 1 means it is absent.
