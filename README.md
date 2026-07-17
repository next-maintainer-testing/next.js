# Next.js issue 47278 reproduction

This minimal Pages Router app renders `next/image` with matching fractional `width` and `height` props. Run `node verify.mjs`; exit code 0 means the false-positive aspect-ratio warning appeared, 1 means it did not, and any other code means the check failed.
