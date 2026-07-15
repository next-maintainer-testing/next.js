# Next.js issue 76651 reproduction

This minimal App Router page performs a server-side `fetch` beneath `app/loading.js`.
`node verify.mjs` requests the raw HTML from `next dev` and reports the issue when
the fetched page content is emitted inside a `<div hidden id="S:…">` wrapper.
