# Next.js issue 80639 reproduction

This minimal production-mode App Router page places a static `next/link` in the
root layout above an independent client component whose state changes. The
verifier installs the same React renderer hook used by React DevTools and checks
the Link fiber's render flag on the client component's two update commits. Run
`node verify.mjs`; exit 0 means the static Link re-rendered, exit 1 means it
stayed static, and any other exit code means verification failed.
