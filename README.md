# Next.js issue 78484 reproduction

This minimal app reproduces the reported `@typescript-eslint/typescript-estree` warning when the app's lint script runs with Next.js 15.2.4, React 19.1.0, TypeScript 5.7.3, and the reporter's ESLint parser/config generation.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported warning was observed; exit code 1 means it was absent.
