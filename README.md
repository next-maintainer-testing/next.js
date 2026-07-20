# Next.js issue 62726 reproduction

This Pages Router app reproduces the SWC compression bug reported in vercel/next.js#62726. A production build runs the reported conditional assignment and fallback during server-side rendering.

Run `node verify.mjs`. Exit code 0 means the bug is present, exit code 1 means it is absent, and any other code means verification failed.
