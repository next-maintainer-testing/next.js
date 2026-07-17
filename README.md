# Middleware rewrite CSS reproduction

This minimal Pages Router app reproduces issue vercel/next.js#49826. Middleware rewrites every request without `access-cookie` to `/login`, including the page's `/tailwind.css` request. Run `npm install` and `node verify.mjs`; exit code 0 means the unauthenticated stylesheet request returned the rewritten login HTML instead of CSS, while the same request with the access cookie returned CSS.
