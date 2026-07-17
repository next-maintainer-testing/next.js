# useParams interface constraint reproduction

Minimal TypeScript reproduction for vercel/next.js#61951. `node verify.mjs` compiles the client component and reports whether `useParams<PageParams>()` rejects the interface for lacking a string index signature.
