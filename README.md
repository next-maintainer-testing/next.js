# Reproduction for vercel/next.js issue 86504

Install dependencies and run `node verify.mjs`. Exit 0 means the reported failure of the named ESM import `import { configs } from '@next/eslint-plugin-next'` occurred; exit 1 means that import succeeded.
