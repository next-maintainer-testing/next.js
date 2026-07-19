# Issue 50067 reproduction

This app renders a `next/image` with `fill` inside a 480px-wide positioned parent. `node verify.mjs` opens the page at a 1920px viewport and reports whether the browser requests the 1920px optimizer candidate instead of a parent-sized candidate.
