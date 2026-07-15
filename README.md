# Next.js issue 73817 reproduction

This minimal App Router project imports a function containing an inline `"use server"` directive into a Client Component. The verifier starts `next dev`, requests the page, and checks whether the resulting compiler diagnostic contains the reported broken `#with-client-components` documentation URL.

Run with `npm install && npm run verify`. Exit code 0 means the reported symptom is present; 1 means it is absent; any other code means verification failed.
