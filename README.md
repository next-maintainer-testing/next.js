# Next.js issue 76005 reproduction

The root layout imports a `use client` module whose only observable behavior is `console.log('hello')`. Run `npm install` and `node verify.mjs`; exit 0 means the browser loaded the page but the expected log was missing, reproducing the issue, while exit 1 means the log appeared.
