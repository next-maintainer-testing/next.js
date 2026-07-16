# Next.js issue 46078 reproduction

This minimal TypeScript project uses ESM (`"type": "module"`) and NodeNext module resolution. Run `npm install` and `node verify.mjs`; exit 0 means TypeScript emitted the reported `TS2307` diagnostic for `next/head`, while exit 1 means the import resolved.
