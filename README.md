# Next.js issue 47394 reproduction

This minimal Pages Router app checks whether `next build`, when the project is located below a traversable but unreadable parent directory, logs Webpack's `Caching failed for pack: Error: Unable to snapshot resolve dependencies` warning.

Run the machine check with `node verify.mjs`. Exit code 0 means the reported warning occurred; exit code 1 means it did not occur.
