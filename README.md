# Next.js issue 58707 reproduction

This minimal project uses `next/jest` and imports the pure-ESM `chalk` package from a Jest test. Run `node verify.mjs`: exit 0 means Jest reproduced the reported `Cannot use import statement outside a module` error, while exit 1 means the import worked.
