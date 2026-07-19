# Next.js issue 52314 reproduction

Requests a URL containing two configured locale segments (`/en/fr`) with Pages Router i18n and middleware. The verifier reports the issue only when Next.js emits the locale invariant error or serves an erroneous 5xx response.
