# Next.js issue 76074 reproduction

This verifier creates the default JavaScript App Router + Tailwind project using the create-next-app release matching the installed Next.js version, then makes the reporter's sole page change to `font-mono` text.

Run `npm install`, then `node verify.mjs`. Chromium compares the target's computed `font-family` with a reference using the generated `--font-geist-mono` variable directly. Exit 0 means the reported fallback-font symptom is present; exit 1 means it is absent.
