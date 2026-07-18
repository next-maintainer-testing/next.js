# Issue 61208 reproduction

This minimal App Router page binds a class instance to a Server Action and passes the bound action to a Client Component form. In `next dev`, rendering the page reproduces the reported server-side `unhandledRejection` serialization error.

Run the machine check with `node verify.mjs`. Exit 0 means the reported symptom occurred, exit 1 means it was absent, and any other exit code means the check failed.
