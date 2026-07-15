import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    getNodeAutoInstrumentations()
  }
}
