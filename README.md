# Next.js issue 58597 reproduction

The home page starts with a black heading. Page 2 imports a global stylesheet that turns headings red. The verification performs client-side navigation to Page 2 and back, then checks whether the unloaded page's global rule still makes the home heading red.

Run with `npm install` followed by `node verify.mjs`. Exit code 0 means the reported stale-global-CSS symptom is present; 1 means it is absent.
