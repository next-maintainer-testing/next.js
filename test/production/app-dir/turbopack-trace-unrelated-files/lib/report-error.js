import { captureException } from '@sentry/nextjs'

export function reportError(error) {
  captureException(error)
}
