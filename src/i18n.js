export const COOKIE_NAME = 'NEXT_LOCALE';

// This function is not used by middleware, so its JSON imports should be shaken out.
export async function getMessages(locale) {
  return (await import(`../messages/${locale}.json`)).default;
}
