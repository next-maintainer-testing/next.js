# Next.js issue 71934 reproduction

A dynamic import has `/* webpackExclude: /\.mp4$/ */` and resolves an adjacent MP4 file. Webpack excludes the file and renders an HTTP 200 response. Turbopack 15.0.1 ignores the magic comment, attempts to compile the MP4, and returns HTTP 500 with `Unknown module type`.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported Turbopack bug is present; exit 1 means it is absent.
