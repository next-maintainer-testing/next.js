# Next.js issue 58294 reproduction

This app builds with standalone output under `NODE_ENV=test`, starts the generated server with the same environment, and reads `process.env.NODE_ENV` from a dynamic route. Run `node verify.mjs`; exit 0 means the standalone runtime changed it to `production`, while exit 1 means it remained `test`.
