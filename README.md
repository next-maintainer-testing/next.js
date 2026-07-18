# Next.js issue 60877 reproduction

This App Router project imports `next-redux-wrapper` from a Server Component. In Next.js 13.4.13, the wrapper imports `next/router`, causing the reported `createContext only works in Client Components` build error.

Run `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means it was absent.
