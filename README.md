# Issue 66292 reproduction

This minimal App Router project reproduces Tailwind CSS HMR failing for an active intercepted route under `next dev` with webpack. `node verify.mjs` opens the intercepted modal in Chromium, changes its width utility, and checks the rendered element's computed width.
