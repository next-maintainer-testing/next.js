# Next.js issue 67623 reproduction

This minimal app checks the production standalone image optimizer when `sharp` is installed at build time but its traced native optional package is unavailable at runtime, matching the reported Docker failure mode. The verifier requests width 128 for an 800x800 WebP and reports the bug only when production falls back to the original 800x800 image.

Run `node verify.mjs`. Exit 0 means the bug is present, exit 1 means it is absent, and any other exit code means verification failed.
