# Root template nested-navigation reproduction

This minimal App Router application demonstrates issue #60032. The root `app/template.js` records each mount. `verify.mjs` navigates from `/website/view` to the deeper sibling `/website/edit` and reports the bug when the root template does not remount.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
