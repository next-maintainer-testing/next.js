# CacheHandler full-page tags reproduction

This minimal App Router application performs a cached fetch tagged with `my-data-tag` and `home-page`. Its custom cache handler logs each `set` context. On Next.js 15.4.0-canary.23, the tagged fetch context contains both tags, but the `/index` full-page context does not.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means it is absent.
