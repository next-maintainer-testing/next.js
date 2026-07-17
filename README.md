# Next.js issue 84249 reproduction

This app uses the CSP guide's documented middleware matcher. `verify.mjs` compares a normal page request with Chrome's legacy `Purpose: prefetch` preload request and reports the bug when the latter skips middleware and receives no CSP header.
