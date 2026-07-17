# Next.js issue 82315 reproduction

The app contains enough App Router entries to expose the reported development-server route-table race. `node verify.mjs` first proves `/2025/probe` returns 200, edits its source to trigger HMR, and reports the bug only if that same route transiently returns 404.
