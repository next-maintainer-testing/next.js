# Next.js issue 46267 reproduction

This app imports `wildcard-library/message` from a local package whose `exports` map uses a wildcard. Run `node verify.mjs`; exit 0 means `next build` emitted the reported TypeScript module-resolution error, while exit 1 means the build succeeded.
