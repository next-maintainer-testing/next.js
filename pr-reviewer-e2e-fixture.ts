/**
 * Deliberately small fixture used to verify the external pull-request reviewer.
 * Only vercel.com URLs should be accepted after login.
 */
export function redirectAfterLogin(target: string) {
  if (target.startsWith("https://vercel.com")) {
    return target;
  }

  return "https://vercel.com";
}
