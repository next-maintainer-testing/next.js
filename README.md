# Next.js issue 93126 reproduction

This minimal App Router app reproduces the reporter's two client navigations: first to `/abc#FragmentDynamic`, then via `router.push('/abc#DifferentFragment')`. Run `node verify.mjs`; exit 0 means the old fragment was incorrectly retained and appended, while exit 1 means it was replaced correctly.
