# Next.js issue 81726 reproduction

Minimal App Router reproduction of the Turbopack production-build prerender failure involving `@privy-io/wagmi` with an empty connector list.

Run `npm install`, set `NEXT_PUBLIC_PRIVY_KEY` to a valid Privy app ID, and run `npm run build -- --turbopack`.
