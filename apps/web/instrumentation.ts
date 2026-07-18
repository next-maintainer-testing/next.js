import { registerOTel } from '@repro/server-observability/instrumentation';

export async function register() {
  await registerOTel();
}
