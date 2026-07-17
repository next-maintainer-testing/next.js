# Next.js issue 78013 reproduction

The root layout defines an icon and the page extends `parentMetadata.icons` in `generateMetadata`. On the reported version, requesting `/` triggers `TypeError: Cannot add property rel, object is not extensible` during server rendering.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
