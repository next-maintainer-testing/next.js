import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

export const exporter = new OTLPTraceExporter({
  url: 'https://otel.localhost:443',
});
