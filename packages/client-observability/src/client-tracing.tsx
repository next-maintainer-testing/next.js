'use client';

import { TracingInstrumentation } from '@grafana/faro-web-tracing';

export default function ClientTracing() {
  void TracingInstrumentation;
  return null;
}
