# Next.js custom-server esbuild reproduction

This minimal project imports Next.js from a custom Node.js server and asks esbuild to bundle the complete server. The verifier succeeds only when esbuild fails with one of the dependency-resolution diagnostics reported in vercel/next.js#71515.

Run `npm install` and then `node verify.mjs`.
