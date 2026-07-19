# Next.js issue 58281 reproduction

This minimal App Router application redirects unlocalized paths to `/en/...` in middleware. A server action calls `redirect('/login')`. The verifier opens `/login`, confirms normal navigation reaches `/en/login`, submits the server action, and checks the browser's resulting URL while confirming the login route remains rendered.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported stale `/login` browser URL occurred; exit code 1 means the browser URL correctly remained `/en/login`.
