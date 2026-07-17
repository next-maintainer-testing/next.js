# Next.js issue 83905 reproduction

This app simulates a browser missing `Intl.Locale`. `instrumentation-client.js` begins an asynchronous polyfill, while a Client Component records whether the API is usable when application code runs after hydration. Run `node verify.mjs`; exit 0 means application code ran before the polyfill's top-level await completed.
