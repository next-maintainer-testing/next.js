# Next.js issue 46876 reproduction

This app reproduces the Pages Router `asPath` normalization bug. Requesting
`/test/bn?bob=price%3A8+to+10&page=2` should preserve the literal `+` in
`getInitialProps`'s `asPath`. Affected Next.js versions instead expose `%20`.

Run `node verify.mjs`. Exit code 0 means the symptom is present; exit code 1
means it is absent.
