# Next.js issue 77436 reproduction

This minimal app mirrors the reported import shape: a `force-dynamic` auth route imports a server authentication module whose database adapter requires `DATABASE_URL` during initialization. The verification command removes prior build output, unsets `DATABASE_URL`, runs `next build`, and succeeds only when the build evaluates that route module and emits the dedicated database-configuration error.

Run `npm install` and then `node verify.mjs`.
