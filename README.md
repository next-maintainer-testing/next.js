# Next.js issue 64879 reproduction

This App Router application starts OpenTelemetry's HTTP instrumentation from
`instrumentation.js`. The `/make-req` route creates an explicit active span and
uses Node's `http.get()` to call `/check`. A working HTTP instrumentation patch
injects a `traceparent` header; the reported bug leaves it absent.

Run the persisted check with `node verify.mjs`. Exit code 0 means the reported
symptom is present, 1 means it is absent, and any other code means the check
failed.
