# Next.js issue 70911 reproduction

This app reproduces delayed navigation streaming for a `force-static` dynamic route with `dynamicParams = true`. Run `npm install`, then `node verify.mjs`. Exit 0 means the static marker was delayed until the five-second Suspense task completed; exit 1 means the static shell streamed before completion.
