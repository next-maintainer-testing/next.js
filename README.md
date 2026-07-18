# Next.js issue 41962 reproduction

This reproduces the reported `next/link` behavior with a React Fragment child. Run `npm install` and `node verify.mjs`.

The verifier exits 0 when the rendered text is present but the expected `/about` anchor is absent, 1 when the anchor renders, and 2 if the check itself fails.
