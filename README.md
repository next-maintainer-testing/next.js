# Next.js issue 70912 reproduction

This minimal app extends a TypeScript config whose `paths` entry uses the TypeScript 5.5 `${configDir}` variable. `npm run typecheck` resolves `~/lib/message`, while affected Next.js versions fail to resolve that same import during `npm run build`.

Run `npm install`, then `node verify.mjs`.
