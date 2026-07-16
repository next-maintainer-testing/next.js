# Next.js issue 49587 reproduction

This standalone app reproduces the reported `Error: aborted` / `ECONNRESET` uncaught exception with the same three components: Next.js middleware, a production custom Express server, and nginx configured with `proxy_intercept_errors on` plus `error_page 404 /not_found`.

`node verify.mjs` builds the app, starts the custom server and an unprivileged local nginx, sends repeated POST requests to missing routes, and exits 0 only when the custom server reports the aborted uncaught exception. The script downloads and locally extracts Ubuntu's nginx package when nginx is not already present; it does not need root privileges.
