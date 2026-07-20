# Next.js issue 72810 reproduction

This minimal App Router page returns language alternates containing query strings from `generateMetadata`. Run `node verify.mjs`; exit 0 means Next.js stripped both query strings, while exit 1 means it preserved them.
