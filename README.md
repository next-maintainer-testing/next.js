# Next.js issue 72063 reproduction

This Pages Router app renders locale-switching links from `router.asPath` on an i18n catch-all SSR route. Requesting `/ja/tag/groovy?nxtPslugList=groovy` detects whether the internal route parameter leaks into rendered links.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
