import { trace } from '@opentelemetry/api'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const value = await trace
    .getTracer('nextjs-example')
    .startActiveSpan('issue-61975-page', async (span) => {
      try {
        return 'ready'
      } finally {
        span.end()
      }
    })

  return <main>OpenTelemetry {value}</main>
}
