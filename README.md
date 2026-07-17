# Next.js issue 83288 reproduction

This app models Azure Static Web Apps' build/runtime split: TypeScript is available while building, then omitted as a development dependency during production warm-up. The verifier checks whether `next start` hangs while trying to install TypeScript solely to load `next.config.ts`.
