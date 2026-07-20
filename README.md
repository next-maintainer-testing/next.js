# Next.js issue 49857 reproduction

This Pages API route returns the runtime type and value of a POST body. The verifier sends JSON using Contentful's `application/vnd.contentful.management.v1+json` media type and reports the bug only when Next.js leaves that body as a string.

Run with `npm install` followed by `node verify.mjs`.
