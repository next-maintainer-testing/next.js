# Next.js issue 77447 reproduction

This minimal App Router page renders `YouTubeEmbed` with `params="autoplay=1"`. The verification opens the page in Chromium, confirms that `lite-youtube` has initialized, and checks whether an iframe/player is created automatically without user input.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported no-autoplay symptom is present; exit 1 means autoplay initialized a player; any other exit code means verification failed.
