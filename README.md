# Next.js issue 59521 reproduction

This minimal App Router project places the root layout's children inside a Suspense boundary. The `/missing` server component suspends briefly and then calls `notFound()`.

The reported symptom is present when the response contains `NOT_FOUND_MARKER_59521` but has HTTP status 200 instead of 404. Run `npm install` and `node verify.mjs`; exit 0 means the symptom is present, exit 1 means it is absent, and any other exit code means the check failed.
