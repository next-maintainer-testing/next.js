# Next.js issue 84884 reproduction

This minimal app reproduces retained `AbortSignal` objects when Axios uses its fetch adapter in middleware. Run `npm install`, then `node verify.mjs`; exit 0 means the leak symptom is present and exit 1 means it is absent.
