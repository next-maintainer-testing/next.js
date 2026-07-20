# Redirect caught by a Route Handler

This minimal app reproduces issue #64540. `GET /example` calls `redirect()` inside a `try` block; the matching `catch` intercepts Next.js's redirect exception and returns the fallback 404 response instead of a redirect.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported swallowed-redirect symptom occurred; exit 1 means a redirect was returned.
