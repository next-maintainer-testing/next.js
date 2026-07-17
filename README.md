# Reproduction for vercel/next.js #77681

The root layout exports fallback metadata with the title `Metadata: Root Layout`, while the dynamic async root page renders the React 19 inline title `Metadata: Page`, matching a CMS-backed page. On a direct visit, the page title should take priority.

Run `node verify.mjs`. It builds and starts the app, opens the root route directly in a bundled headless Chromium, waits for hydration, and exits 0 only when the observed browser title is incorrectly the layout fallback.
