# Next.js issue 74897 reproduction

This minimal App Router application reproduces the `next/og` failure for the Arabic phrase from the report. The check starts `next dev`, requests `/og`, and reports the symptom when the endpoint fails to return a non-empty PNG image.

Run `npm install` and `npm run verify`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent; any other exit code means the check itself failed.
