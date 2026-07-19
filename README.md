# Issue 78323 reproduction

This minimal Next.js application reproduces the Rspack production-build warning that reports invalid SCSS only through a hashed `static/css` path rather than the source `app/example.scss` path.

Run `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
