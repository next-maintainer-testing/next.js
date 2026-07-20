# Next.js issue 70068 reproduction

This minimal App Router app reproduces a Server Component calling a Route Handler that sets a cookie and then redirecting. The check confirms that the internal Route Handler response contains `Set-Cookie` while the browser-facing `/auth` response does not.

Run with `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent.
