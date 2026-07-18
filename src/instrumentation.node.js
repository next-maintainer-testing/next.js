const { CompositePropagator, W3CTraceContextPropagator } = require('@opentelemetry/core')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc')
const { registerInstrumentations } = require('@opentelemetry/instrumentation')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const { Resource } = require('@opentelemetry/resources')
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')

registerInstrumentations({ instrumentations: [new HttpInstrumentation()] })

const resource = Resource.default().merge(
  new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: 'next' })
)
const provider = new NodeTracerProvider({ resource })
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({ url: 'http://localhost:4317/v1/traces' })
  )
)
provider.register({
  propagator: new CompositePropagator({
    propagators: [new W3CTraceContextPropagator()],
  }),
})
process.on('SIGTERM', () => provider.shutdown())
