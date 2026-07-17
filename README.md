# Next.js issue 64831 reproduction

This app renders the documentation's `GoogleMapsEmbed` example with `width="100%"`. The verifier starts the app and checks the rendered embed wrapper. It reports the bug only when the runtime output has the invalid `width:100%px` style.

The verifier aligns `@next/third-parties` with the installed Next.js version before testing because the packages are versioned and released together.
