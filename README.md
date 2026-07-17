# NextURL `host` setter retains the previous port

This minimal app reproduces vercel/next.js issue #82751 on Next.js 15.4.3. The `/api` route clones `request.nextUrl`, sets `url.host = 'example.com'`, switches to HTTPS, and redirects. `verify.mjs` starts `next dev`, requests the route with `Host: example.com:3000`, and checks whether the redirect still contains port 3000.

Run with:

```sh
npm install
node verify.mjs
```

Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
