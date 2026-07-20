import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel('next-61975-repro')
}
