# Next.js issue 55473 reproduction

This minimal App Router project marks the root layout as a client component so it can use `useState`, while also exporting `metadata`. The verification command runs a production build and reports the issue only when Next.js rejects that metadata export because the layout has `"use client"`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent; any other code means the check failed.
