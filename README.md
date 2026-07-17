# Next.js issue 85237 reproduction

This app reproduces the inconsistent webpack handling of `import { randomUUID } from "crypto"` in a Client Component: server rendering succeeds, while browser hydration throws because `randomUUID` is unavailable.

Run `npm install` and `npm run dev`, then open http://localhost:3000.
