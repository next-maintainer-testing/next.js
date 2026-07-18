# Next.js issue 76637 reproduction

This minimal App Router page imports `glob` from `zx` and renders its type. Run `node verify.mjs` after installing dependencies. Exit 0 means the reported `.next/server/package.json` ENOENT occurred; exit 1 means the page rendered successfully; any other exit means the check failed.
