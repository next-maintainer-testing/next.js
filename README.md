# Next.js issue 46678 reproduction

This minimal Pages Router app reproduces failure to resolve a TypeScript source file from a fully specified `.js` dynamic import under TypeScript's Node16 module resolution.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported module-resolution failure was observed; exit code 1 means the build succeeded; any other exit code means verification itself failed.
