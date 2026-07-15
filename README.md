# Next.js issue #68054 reproduction

This App Router page passes two client `Item` elements to a server `List`. The server renders each child's `type.name` and `displayName`; the reported symptom is present when neither identifies `Item`.

Run `node verify.mjs` after installing dependencies. Exit code 0 means the symptom is present, 1 means absent, and 2 means the check could not complete.
