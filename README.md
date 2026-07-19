# Next.js issue 77679 reproduction

This reproduction runs the bundled `create-next-app` release matching the installed reported or frozen-canary Next.js version with `--skip-install`, then checks the generated `package.json`. The bug is present when `dependencies` or `devDependencies` are not alphabetically sorted.

Run `npm install`, followed by `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
