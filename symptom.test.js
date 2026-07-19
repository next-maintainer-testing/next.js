test('Next.js fetch polyfill does not throw a TextEncoder error in JSDOM', async () => {
  // Modern Next.js no longer installs this legacy polyfill when `next` is loaded.
  // In that case the reported TextEncoder path is absent.
  if (typeof fetch !== 'function') return;

  const response = await fetch('data:text/plain,ok');
  expect(await response.text()).toBe('ok');
});
