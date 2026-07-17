# Next.js issue 82723 reproduction

This minimal app reproduces the reported Turbopack production-build crash involving Zod 4 and shared route imports. Run `npm install` and `node verify.mjs`; exit code 0 means the `ZodEnum` initialization error occurred, while exit code 1 means the build succeeded.
