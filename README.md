# Issue 78878 reproduction

Minimal App Router static-export application showing that a client-only dynamic route using `useParams()` cannot be built unless its paths are supplied by `generateStaticParams()`. This prevents an SPA-style fallback route from being emitted.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported build rejection occurred; exit 1 means the export accepted the route.
