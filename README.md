# Next.js issue 77101 reproduction

This minimal App Router application submits a Server Action that calls `redirect("/example?hello=world#hash")`. `verify.mjs` drives Chromium, clicks the form button after hydration, and checks the browser's final URL. Exit code 0 means the reported missing-fragment symptom occurred; exit code 1 means the fragment was preserved.
