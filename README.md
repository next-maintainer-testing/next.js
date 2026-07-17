# Next.js issue 47047 reproduction

This app-only project contains an HTML link to an internal route and no `pages` or `src/pages` directory. The verifier runs the version-aligned Next.js ESLint configuration and detects the erroneous `Pages directory cannot be found` diagnostic from `@next/next/no-html-link-for-pages`.

Run `node verify.mjs`; exit 0 means the reported diagnostic is present, exit 1 means it is absent, and exit 2 means verification failed.
