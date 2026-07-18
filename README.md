# Pages Router scroll restoration reproduction

This standalone app reproduces vercel/next.js issue #68746 with Next.js 14.2.5 and React 18.2.0. Run `node verify.mjs`; exit 0 means browser Back failed to restore the prior scroll position, while exit 1 means it was restored.
