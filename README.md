# Next.js issue 65394 reproduction

A client button invokes a Server Action. Middleware redirects that POST to `/redirected` with `NextResponse.redirect()`. The reported bug is present when the action POST occurs but the browser remains on `/` instead of navigating to the redirect destination.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means it is absent; any other code means the check failed.
