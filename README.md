# Next.js issue 77178 reproduction

This minimal app keeps `.env` in `env/dev` and calls `loadEnvConfig('./env/dev')` from `next.config.ts`, matching the reporter's CodeSandbox. Run `npm install` and `node verify.mjs`. The verifier exits 0 when `loadedEnvFiles` is empty and the statically rendered page reports the variable missing, 1 when `.env` is returned and the page renders its value, and 2 if the check cannot run consistently.
