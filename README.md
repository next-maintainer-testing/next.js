# Next.js issue 62479 reproduction

This minimal production app preserves the reporter's custom-server request handling and a dynamic `[lang]` App Router page with client JavaScript.

The verification builds and starts the app, loads `/en`, finds its encoded dynamic-route script URL, confirms the canonical URL loads, and requests the same URL after changing percent-encoded brackets from uppercase (`%5B`, `%5D`) to lowercase (`%5b`, `%5d`). A 404 for only the lowercase spelling reproduces the reported Chunk Load Error trigger.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the symptom is present, 1 means absent, and 2 means the check could not complete.
