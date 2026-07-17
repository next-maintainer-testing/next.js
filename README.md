# Next.js issue 61228 reproduction

This minimal App Router project checks whether running `next build` while `next dev` is active breaks subsequent responses from the development server. `node verify.mjs` exits 0 when that reported symptom is observed and 1 when the dev server remains healthy.
