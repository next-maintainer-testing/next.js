# Next.js issue 78270 reproduction

This minimal app checks whether a root layout is rerendered when `router.push()` runs immediately after an otherwise empty Server Action. Run `node verify.mjs`; exit 0 means the reported symptom is present and exit 1 means it is absent.
