import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') getNodeAutoInstrumentations()
}
