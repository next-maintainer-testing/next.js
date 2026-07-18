# Next.js issue 65387 reproduction

This minimal App Router fixture has the reported dashboard and blog links. The verifier starts `next dev`, repeatedly follows both links in Chrome, and listens through Chrome DevTools Protocol for a failed/aborted `_rsc` request—the network event Chrome reports as `Fetch failed loading` when “Log XMLHttpRequests” is enabled.
