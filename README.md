# Next.js issue 56016 reproduction

This minimal Pages Router app combines `basePath`, middleware, an index page, and a root dynamic route. The persisted check requests the index page's client-navigation data URL and fails as the reported bug when Next.js incorrectly renders `/[whatever]` for `index`.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
