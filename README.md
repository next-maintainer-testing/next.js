# Next.js issue 76468 reproduction

This minimal TypeScript Next.js project installs the Jest manual-setup packages documented when the issue was reported, but intentionally omits `@types/jest`. Run `node verify.mjs` to confirm that TypeScript cannot resolve the `describe`, `test`, and `expect` globals.
