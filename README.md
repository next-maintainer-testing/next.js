# Issue 63270 reproduction

This minimal app directly posts to a built Server Action and verifies that the request passes through Next.js middleware. The middleware adds `x-server-action-middleware: observed` only when the `Next-Action` request header is present.
