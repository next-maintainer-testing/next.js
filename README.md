# Next.js issue 77381 reproduction

This JavaScript-only app checks whether the matching `eslint-config-next` can lint a `.js` App Router page without TypeScript installed. The verifier exits 0 only when ESLint fails because `typescript` cannot be resolved, 1 when lint succeeds, and 2 for unrelated setup or lint failures.

Run with `npm install` and `node verify.mjs`.
