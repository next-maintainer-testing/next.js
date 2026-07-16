# Issue 48505 reproduction

This is a minimal form of the historical `with-emotion-swc` example. Its module-level Emotion `CacheProvider` cache causes a warmed development server to omit Emotion CSS from later SSR responses, producing a flash of unstyled content until hydration.

`node verify.mjs` starts the development server, warms its Emotion cache, then opens a JavaScript-blocked browser page to inspect the server-rendered first-paint styles. It exits 0 when the card is visibly unstyled, 1 when their expected computed styles are present, and 2 if the check cannot run.
