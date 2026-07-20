# Next.js issue 31420 reproduction

This minimal Pages Router app configures `en`, `de`, and `us` locales and has both `/` and `/[slug]` routes. The verifier confirms `/en/test` reaches the slug route, then detects the bug when `/en/en` incorrectly reaches the home route instead of treating the second `en` as the slug.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means absent.
