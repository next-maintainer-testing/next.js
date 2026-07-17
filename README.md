# Next.js issue 82944 reproduction

This minimal app checks whether `next build` rewrites TypeScript's `compilerOptions.module` from `node20` to `esnext`. Run `node verify.mjs`; exit 0 means the reported rewrite occurred, exit 1 means it did not, and any other exit code means the check failed.
