# Next.js issue 54838 reproduction

This App Router page places an input in a scroll container. Each input event calls `router.replace` to reflect the value in the URL. `node verify.mjs` uses Firefox to check whether that URL update incorrectly moves focus away from the input.

Exit code 0 means the reported focus-loss symptom occurred, 1 means focus stayed on the input, and any other code means verification failed.
