# Next.js issue 74252 reproduction

This minimal app imports a package whose `module` entry points directly to TypeScript. Without `transpilePackages`, requesting `/` reproduces the reported parse failure on Next.js 15.1.1-canary.17.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
