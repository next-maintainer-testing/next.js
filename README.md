# Next.js issue 82451 reproduction

This static-export app links from `/` to `/page-a`. The verifier serves exported `.txt` flight payloads without a `Content-Type` header, opens the app in Chromium, waits for prefetch, clicks the link, and records whether navigation falls back to a new HTML document request.

Run `npm install && node verify.mjs`. Exit code 0 means the reported full-page navigation occurred; exit code 1 means client-side navigation succeeded; any other code means the check failed.
