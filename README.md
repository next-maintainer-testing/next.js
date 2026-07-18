# Next.js issue 85296 reproduction

This app renders a CSS Module class that transitively composes `.b` and `.a` from `.c`.

Run `npm install`, then `node verify.mjs`. Exit 0 means Turbopack emitted the reported broken `c b` class chain without `a`; exit 1 means the full chain was emitted.
