export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ registerInitialCache }, { default: CacheHandler }] = await Promise.all([
      import('@neshca/cache-handler/instrumentation'),
      import('./cache-handler.mjs'),
    ]);
    await registerInitialCache(CacheHandler);
  }
}
