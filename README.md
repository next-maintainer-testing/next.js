# Next.js issue 45483 reproduction

This minimal App Router project creates a database-like connection at module scope. The verifier starts `next dev`, loads the page, edits the imported connection module twice, and confirms from server runtime output whether each Fast Refresh creates another connection.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported repeated-connection symptom is present; 1 means absent; any other code means verification failed.
