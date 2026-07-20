# Reproduction for vercel/next.js #59457

This App Router page renders one host element directly from a Server Component and one from a Client Component. `node verify.mjs` starts the development server, inspects the live React fibers in Chromium, and reports the issue when the server-rendered element lacks debug source/owner metadata while the client control has it.
