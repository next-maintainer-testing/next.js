This standalone reproduction configures custom `pageExtensions`, serves a valid `pages/index.page.js`, and deliberately names the root middleware `middleware.ts` without the configured `.page` suffix.

Run `node verify.mjs`. Exit 0 means the reported symptom is present: the page loads, but the middleware response header is absent. Exit 1 means the middleware ran and the symptom is absent. Other exit codes mean the check could not complete.
