# Next.js issue 75296 reproduction

This Pages Router app exposes `/gssp` with `getServerSideProps`. Run `node verify.mjs` to request it with `x-now-route-matches: -1`; the check reports the bug when the response status is 500.
