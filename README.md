# Next.js issue 85271 reproduction

This project asks the TypeScript language service for the editor Quick Info shown for `NextConfig.cacheComponents`. The check reports the issue when that Quick Info claims Next.js will “automatically cache page-level components and functions.”

Run `node verify.mjs` after installing dependencies. Exit 0 means the misleading JSDoc is present; exit 1 means it is absent.
