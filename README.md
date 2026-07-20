# Next.js issue 74977 reproduction

This minimal App Router page enables `reactStrictMode` and logs a client effect's mount and cleanup. `node verify.mjs` launches the development server in a real headless Chromium page and reports the bug when React does not perform its Strict Mode development remount cycle.
