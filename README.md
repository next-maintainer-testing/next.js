Minimal reproduction for vercel/next.js#82877. With TypeScript `rootDir` set to `src`, `next build` on 15.5.1-canary.2 includes `.next/types/validator.ts` outside that root and fails type checking.
