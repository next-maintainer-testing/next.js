# Next.js issue 86983 reproduction

This app uses the reported static-export and custom webpack chunk naming setup. The check builds deployment A, preserves its cacheable HTML, builds deployment B, and serves the preserved HTML with only deployment B's assets. It succeeds only when the old HTML is blank before hydration and a JavaScript chunk required by that HTML returns HTTP 404.

Run `npm install`, then `node verify.mjs`.
