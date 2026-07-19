# Next.js issue 78116 reproduction

This minimal app imports a Material UI v5 `Alert` through a compiled ESM dependency installed as a regular package. With the affected Next.js webpack development server, requesting the App Router page fails at runtime because the imported value is not a valid React component.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the invalid-element HTTP 500 symptom was observed; exit code 1 means it was absent.
