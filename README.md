# Next.js issue 74988 reproduction

This app renders a throwing server component through nested async server components. `node verify.mjs` reports the bug when the terminal error includes only the throwing frame and omits both caller component frames.
