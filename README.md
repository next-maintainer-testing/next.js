# Next.js issue 87737 reproduction

This minimal App Router application imports `@opentelemetry/auto-instrumentations-node` from the instrumentation hook and builds with the default Turbopack production bundler.

The verification builds the app, confirms that the server output references a content-hashed `require-in-the-middle` external, removes `.next/node_modules` to model the reported deployment archive that excludes `node_modules` directories, and starts the production server. Exit code 0 means startup failed with the reported unresolved hashed external; exit code 1 means the symptom is absent.

Run with:

```sh
pnpm install --frozen-lockfile
node verify.mjs
```
