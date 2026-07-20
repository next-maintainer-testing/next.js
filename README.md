# Next.js issue 72389 reproduction

This App Router page fetches an intentionally streaming HTTP response and awaits
`response.body.cancel()`. The verification script builds and starts Next.js in
production mode, requests `/`, and detects whether the cancellation remains
pending instead of allowing the page response to complete.

Run with `node verify.mjs`. Exit 0 means the reported hang is present; exit 1
means cancellation resolves and the page returns.
