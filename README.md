# Issue 62903 reproduction

A server action redirects to `/blog`; middleware logs the host seen by the original and internally redirected requests. Run `node verify.mjs` after installing dependencies. Exit 0 means the redirect changed `localhost:<port>` to `[::]:<port>`.
