# Next.js issue 45620 reproduction

The nested `not-found.js` exports a unique title, while `/missing` calls `notFound()`. The verifier builds and serves the app, requests `/missing`, and reports the issue when the custom not-found UI renders with status 404 but its exported title is absent from the HTML.

Run with `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
