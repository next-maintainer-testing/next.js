# Next.js issue 58052 reproduction

This minimal App Router page imports and executes `p-limit@5.0.0` in a server component. Run `npm install`, then `node verify.mjs`; exit 0 means the reported `#async_hooks` module-resolution failure occurred, while exit 1 means it did not.
