# Next.js issue 51478 reproduction

This app configures `pageExtensions: ['custom.js']`. The Pages Router route at `/mypage` uses that extension, while the App Router route at `/myotherpage` uses the standard `page.js` convention. `node verify.mjs` reports the bug when the first route works but the App Router route returns 404.
