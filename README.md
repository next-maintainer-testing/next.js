# Next.js build determinism reproduction

`node verify.mjs` performs consecutive clean webpack builds with a fixed build ID and exits 0 when standalone output differs outside the two manifests that contain expected random secrets.
