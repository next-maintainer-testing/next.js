# Issue 77472 reproduction

Minimal pnpm workspace reproducing the standalone startup failure from vercel/next.js#77472.

Run `pnpm install`, `pnpm --dir apps/web build`, then `node apps/web/.next/standalone/server.js`.
