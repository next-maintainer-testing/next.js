# Issue 74895 reproduction

Minimal App Router reproduction for Vercel production routing. Navigate Home → Payment → Progress. Progress should be intercepted into the Payment modal slot, but the deployed RSC route serves the normal Progress page.

Run the deterministic check with `node verify.mjs`.
