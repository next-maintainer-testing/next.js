# Next.js issue 73938 reproduction

The `GET /api/unauthorized` route calls `unauthorized()`. The custom `unauthorized.js` UI should be rendered, but the reported version returns an empty 401 response instead.

Run `node verify.mjs` after installing dependencies. Exit 0 means the reported symptom is present; exit 1 means the custom unauthorized UI rendered.
