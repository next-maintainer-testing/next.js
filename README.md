# Next.js issue 46825 reproduction

This standalone app mirrors the reporter's StackBlitz: a root-layout `beforeInteractive` script logs on the home route but fails to log when `/article` renders the App Router not-found UI.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
