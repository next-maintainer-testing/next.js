# Next.js issue 56333 reproduction

This minimal App Router project contains an intentional TypeScript error in
`app/__tests__/example.test.ts`. The file is included by `tsconfig.json`, but
`next build` exits successfully because Next.js excludes test files from its
built-in type check.

Run `npm install` followed by `node verify.mjs`. Exit code 0 means the reported
symptom is present; exit code 1 means Next.js detected the test-file error.
