# Next.js issue 55208 reproduction

This Pages Router app uses `Link` with `href="/test?id=1"` and `as="/test/1"` while a pass-through middleware is enabled. The verifier clicks the link in Chromium and checks whether Next.js renders the masked path's route instead of the href route.
