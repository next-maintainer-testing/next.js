# Next.js debugger breakpoint reproduction for #62008

This minimal App Router project exposes `GET /api/health`. The verification script launches `next dev` under the Node inspector, sets a breakpoint on the response line in the exact local TypeScript route, requests the route, and reports the issue when the route executes successfully while the breakpoint remains unbound.

Run with `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
