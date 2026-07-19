# Next.js issue 74484 reproduction

This minimal App Router project reproduces the reporter's Tailwind/PostCSS Fast Refresh state reset. `node verify.mjs` starts `next dev`, sets client state, edits only paragraph text, and reports whether that state is lost during Fast Refresh.
