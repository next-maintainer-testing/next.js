# Reproduction for vercel/next.js #57392

The page references a server action through a hoisted function declaration before the declaration appears, with the declaration after the component's `return`. This is valid JavaScript ordering, but Next.js 13.5.6 fails to recognize the transformed function as a server action and fails while prerendering.

Run `node verify.mjs`. Exit 0 means the reported failure is present, exit 1 means it is absent, and any other exit code means the check itself failed.
