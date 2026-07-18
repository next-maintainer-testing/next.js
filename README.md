# Next.js issue 79010 reproduction

This minimal App Router application preserves the reported pattern: a client component creates a `next/dynamic` component with `ssr: false`, and the loaded client component calls a Server Action during render and unwraps it with React `use`. The action writes one line per invocation to a temporary path supplied by the verifier.

Run `npm install`, then `node verify.mjs`. Exit 0 means the action repeats while the UI remains suspended; exit 1 means the stock renders without repeated calls.
