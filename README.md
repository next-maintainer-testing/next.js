# Next.js issue 82387 reproduction

This minimal Fastify custom server attempts to set a `Set-Cookie` header after the Next.js request handler, matching the reported order. `node verify.mjs` builds and starts the app, confirms the page and cookie work when the header is set before `handle(req, res)`, then reports the symptom when the post-handler attempt does not put the cookie in the HTTP response.
