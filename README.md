# Next.js issue 67522 reproduction

Open `/start` and follow the link. The soft navigation reaches `/`, whose server component redirects to `/login`; the `(.)login` parallel route then causes Next.js 15.0.0-rc.0 to request the `/login` RSC payload continuously instead of settling on the intercepted login modal.

`node verify.mjs` launches the app and Chromium through the DevTools Protocol. It exits 0 when at least six `/login?_rsc=...` requests are observed after one click, 1 when navigation settles after fewer requests, and 2 if the browser check cannot run.
