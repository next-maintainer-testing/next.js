# Next.js issue 83505 reproduction

Run `npm install` and `node verify.mjs`. The check starts the route in development mode and exits 0 when the server-side React client internals value is `undefined`, which is the reported symptom.
