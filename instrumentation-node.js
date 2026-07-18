import * as preloadedHttp from 'node:http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

// This native-module import is the condition described in the issue: Next.js
// evaluates it while loading the instrumentation bundle, before register()
// starts OpenTelemetry's require hook.
globalThis.__next64879PreloadedHttp = preloadedHttp;

const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation()],
});

sdk.start();
globalThis.__next64879Sdk = sdk;
