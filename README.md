# Next.js issue #74158 reproduction

This minimal app enables Dynamic IO / Cache Components and renders otherwise identical cached components using `cacheLife("minutes")` and `cacheLife("seconds")`. The config and cache API aliases account only for their rename between the reported release and current releases.

Run `npm install`, then `node verify.mjs`. The verifier exits 0 only when the minutes route does not fail while the seconds route produces the reported missing-Suspense prerender error; it exits 1 when the symptom is absent.
