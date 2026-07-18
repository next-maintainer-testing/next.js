# Next.js issue 76998 reproduction

This checks the reported Next.js 14 installation documentation directly. The symptom is present when the versioned Next.js 14 page still displays `npx create-next-app@latest`, which installs the latest Create Next App instead of keeping the command aligned with the selected documentation version.

Run `node verify.mjs`. Exit code 0 means the misleading command is present, 1 means it is absent, and any other code means the check failed.
