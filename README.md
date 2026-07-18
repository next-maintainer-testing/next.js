# Next.js issue 51233 reproduction

This minimal app registers OpenTelemetry `HttpInstrumentation` alongside Next.js tracing. The verifier sends one `/test` request and checks whether the HTTP server span and Next.js request span are exported on two separate traces.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported duplicate-trace symptom is present; exit 1 means absent; other exits mean the check failed.
