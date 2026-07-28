export function isSafeWebhookUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname.endsWith("github.com");
}
