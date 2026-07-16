# Next.js issue 63949 reproduction

Clicking the button calls `router.push()` and then a three-second server action. The verifier reports the bug when client navigation waits for the action instead of happening immediately.
