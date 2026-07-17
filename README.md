# Next.js issue 18676 reproduction

This app configures `en` and `fr` locales with `en` as the default. The persisted check requests `/` with `Accept-Language: fr-XX,en` and reports the bug when Next.js does not route the request to `/fr`.

Run `npm install`, then `node verify.mjs`.
