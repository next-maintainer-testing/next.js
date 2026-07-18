# Next.js issue 61125 reproduction

This minimal Pages Router API route exports its supported `bodyParser.sizeLimit` configuration with a TypeScript `as const` assertion. The verifier checks whether `next build` warns that it cannot recognize this config and uses the default config instead.
