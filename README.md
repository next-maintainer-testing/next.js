# Next.js issue 78377 reproduction

This minimal App Router project has a parallel-route slot named `@a-b`. Run `node verify.mjs`: exit 0 means the reported webpack build syntax error is present, exit 1 means the build succeeds, and any other exit code means the check failed.
