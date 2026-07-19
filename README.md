# Next.js issue 71616 reproduction

This minimal App Router application defines a custom `app/[lang]/not-found.js` page. Requesting an unmatched URL beneath a locale, such as `/en/definitely-missing`, renders Next.js's default 404 instead of the locale custom not-found page.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means the locale custom page rendered; any other exit code means verification failed.
