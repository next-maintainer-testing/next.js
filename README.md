# Next.js issue 77394 reproduction

A Pages Router request to `/` is rewritten by middleware to `/en/`. The rendered page contains a hash-only `next/link`. Run `node verify.mjs`: exit 0 means the rendered link incorrectly includes `/en`, exit 1 means it remains `#about`, and any other exit code means the check failed.
