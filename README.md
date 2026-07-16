# Next.js issue 39141 reproduction

This minimal Pages Router app reproduces the reporter's inline `next/script` behavior. An inline script with an `id` executes on the first visit but not after navigating away and back; the equivalent script without an `id` executes again.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the symptom is present, 1 means absent, and any other exit code means the check failed.
