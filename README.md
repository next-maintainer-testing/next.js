# Next.js issue 75228 reproduction

This minimal App Router project reproduces stale content and repeated hard navigations after a production rebuild. Run `node verify.mjs`; exit 0 means the reported symptom is present, 1 means absent, and any other exit code means the check failed.
