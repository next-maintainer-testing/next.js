# Issue 75560 reproduction

This minimal app builds with `output: 'standalone'` twice. Between builds, the verifier adds an absolute directory symlink under `.next/standalone` to reproduce on Linux the Windows junction topology implicated by the report. The second Next.js build itself then demonstrates whether cleaning the standalone output follows that link, deletes the installed Next.js library, and fails with the reported `verify-typescript-setup` module error.
