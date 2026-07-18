# Next.js issue 82000 reproduction

The page imports `app/foo.css` through the inline `!!raw-loader!` request and renders the returned source. Run `node verify.mjs` after installing dependencies. The check exits 0 only when the running page also loads that raw-imported file as an active CSS stylesheet, which is the reported bug.
