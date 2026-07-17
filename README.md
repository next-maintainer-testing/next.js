# Next.js issue 64093 reproduction

This minimal App Router project checks the reported `next build` failure under a deliberately constrained file-descriptor limit. Run `node verify.mjs`; exit 0 means the build emitted `EMFILE` / `too many open files`, exit 1 means the build completed, and any other exit code means the check could not run reliably.
