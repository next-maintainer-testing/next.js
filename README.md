# Next.js issue 87884 reproduction

This minimal App Router project uses the default Turbopack development server and the Tailwind PostCSS plugin from a create-next-app-style setup. The verifier loads the runtime CSS chunk, repeatedly changes the `.hero` border radius in `app/globals.css` with an atomic save, and polls the CSS served by `next dev`. It reports the symptom only when a saved radius remains stale after a generous wait; a follow-up save then distinguishes the reported one-revision-behind behavior, resumed updates, or globals.css remaining stuck.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom occurred, 1 means it did not, and any other code means the check could not complete.
