# Next.js issue 76843 reproduction

This minimal App Router application dynamically loads a client-only component (`ssr: false`) which imports `renderMathInElement` from `mathlive@0.104.0`. On the reported Next.js version, Turbopack resolves the package's Node/SSR conditional export and rejects that browser-only named export.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported diagnostic was observed; exit code 1 means the route compiled successfully; any other exit code means the check itself failed.
