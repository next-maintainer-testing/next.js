# Next.js issue 41282 reproduction

This minimal Pages Router app places alternating external and inline `beforeInteractive` scripts in `_document.js`. Run `node verify.mjs`; exit code 0 means the server-rendered script order differs from source order, and exit code 1 means it matches.
