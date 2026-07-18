# Issue 82043 reproduction

An unlocalized unknown path such as `/unknown` is rewritten by middleware to `/en/unknown`. The localized segment defines `app/[locale]/not-found.tsx`; the check reports the bug when Next.js serves its standard 404 instead of that localized custom 404.

Run `node verify.mjs`. Exit 0 means the reported symptom is present, exit 1 means absent, and any other exit code means the check failed.
