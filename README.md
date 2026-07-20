# Next.js issue 42688 reproduction

The reporter's StackBlitz targeted `https://tenders.guru`, which is no longer reachable. This standalone app preserves the reported observation with a controlled HTTPS origin: the URL succeeds when requested directly, but resets connections carrying the rewrite proxy's `X-Forwarded-Host` header. The verifier requests `/api/foo` through the same external rewrite shape and checks Next.js's actual `ECONNRESET` proxy failure.

Run with `npm install` and `node verify.mjs`. Exit code 0 means the reported proxy-reset symptom occurred; exit code 1 means the rewrite worked; other codes mean the check itself failed.
