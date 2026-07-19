# Next.js issue 54681 reproduction

This minimal Pages Router app checks whether `next build` attempts to compile a file outside the project when `.env` is a symlink to that file. Run `npm install`, then `node verify.mjs`.
