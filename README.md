# Next.js issue 61975 reproduction

This minimal App Router project preserves the reported `with-opentelemetry` setup: Next.js 14.1.1-canary.51, React 18.2.0, `@vercel/otel` 1.2.1 (the stable release available when the issue was filed), and `@opentelemetry/api` 1.7.0.

Run `node verify.mjs`. It starts an in-process OTLP/HTTP receiver on the standard collector port, launches `next dev`, requests the dynamic page, and checks whether any trace payload reaches `/v1/traces`. Exit 0 means the reported missing-telemetry symptom is present; exit 1 means telemetry was received.
