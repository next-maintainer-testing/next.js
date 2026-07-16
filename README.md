# Next.js issue 56330 reproduction

Minimal App Router project with a kebab-case parallel slot at `app/parallel-routes/@parallel-panel`. Run `npm install` and `node verify.mjs`; exit 0 means the reported app-loader parse failure is present, while exit 1 means the slot builds successfully.
