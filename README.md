# Next.js issue 64960 reproduction

This minimal TypeScript reproduction calls `Bricolage_Grotesque` with the concrete `wdth` axis value proposed in the issue. Run `npm install` and `node verify.mjs`.

The verifier exits 0 when `next/font/google` rejects the value, 1 if the value is accepted, and 2 for an unrelated check failure.
