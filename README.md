# Next.js issue 55191 reproduction

This minimal App Router project has two route groups with separate root layouts and a custom `not-found.js` in the main group. Requesting an unmatched `/404` URL should render that custom not-found UI, but the reported bug returns a 404 response without its content.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
