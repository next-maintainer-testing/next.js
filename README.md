# Next.js issue 41965 reproduction

This app isolates the root cause confirmed by the reporter: a CJS component library creates React context but has no Client Component boundary. The home page adds `use client` and builds, while `/list/products` imports the same `Box` from a Server Component and fails during `next build`.

Run `node verify.mjs`. Exit 0 means the nested-page failure was reproduced, exit 1 means it was absent, and any other exit code means the check could not make a determination.
