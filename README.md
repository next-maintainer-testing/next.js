# Issue 70406 reproduction

This minimal app copies the CORS middleware example linked in the issue. Because the report did not include an application repository or package versions, it pins Next.js 12.3.4, where the exact reported error is observable. The verifier starts Next.js, sends an `OPTIONS` request with an allowed origin, and reports the bug only if Next.js emits `middleware can not alter response's body`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom occurred; exit code 1 means it did not.
