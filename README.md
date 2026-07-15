# Next.js Rust MDX ampersand reproduction

Minimal reproduction for vercel/next.js#55559. The page contains a Markdown image whose URL has two query parameters and enables `experimental.mdxRs`.

Run `npm install`, then `npm run verify`. The verifier exits 0 when the server-rendered image URL is double-encoded as `&amp;amp;`, 1 when that symptom is absent, and 2 when verification itself fails.
