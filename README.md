# Next.js issue 64287 reproduction

The dynamic root layout calls `headers()`. In a production build, open an unknown URL and use the rendered `Link` to return to `/`. The verifier reports the bug only when the URL changes to `/` while the not-found UI remains rendered.
