# Next.js issue 84995 reproduction

This minimal app imports `dd-trace` from Node instrumentation, matching the report. Run `node verify.mjs`; exit code 0 means `next dev` incorrectly compiled that instrumentation for Edge and emitted the reported missing-GraphQL-module error, while exit code 1 means the symptom was absent.
