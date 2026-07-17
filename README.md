# Next.js issue 90131 reproduction

This minimal Pages Router app configures `de` as the global default locale while `fr` is also the default locale of `example.fr`. On an unlisted/default host, requesting `/fr` should keep `de` as `getServerSideProps`'s and the router's `defaultLocale`; affected releases incorrectly report `fr`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other code means verification failed.
