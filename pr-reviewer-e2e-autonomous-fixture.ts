export function isAllowedRedirect(target: string) {
  try {
    return new URL(target).hostname.endsWith("vercel.com");
  } catch {
    return false;
  }
}
