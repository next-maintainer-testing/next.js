# Issue 76547 reproduction

This standalone app reconstructs the reporter's public StackBlitz reproduction. The verifier starts the app once in development and once in production, makes one request in each mode, and compares the observed `page render`, `button render`, and `layout render` ordering.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported development/production ordering mismatch is present; exit 1 means it is absent; any other exit code means verification failed.
