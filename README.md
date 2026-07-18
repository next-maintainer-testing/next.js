# Next.js issue 78420 reproduction

This minimal app imports `AggregationTemporality` from `@opentelemetry/sdk-metrics` in Edge middleware. On Next.js 15.2.4, `next build` warns that `ConsoleMetricExporter.js` uses unsupported `setImmediate`, even though that exporter is not bundled into the middleware.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported warning is present; exit code 1 means it is absent.
