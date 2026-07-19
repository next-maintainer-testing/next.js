This minimal app reproduces vercel/next.js issue #68206. Requesting `/` invokes an inline function marked `use server` while rendering a Server Component and attempts to set a cookie.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported cookie mutation error was observed; exit code 1 means it was absent.
