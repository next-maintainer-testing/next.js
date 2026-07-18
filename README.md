# Next.js issue 61320 reproduction

This standalone Pages Router app preserves the report's MobX hydration pattern: every App render hydrates a singleton browser store from a large nested `getStaticProps` value. The two buttons route between `/ssg/1` and `/ssg/2`, while `_app.js` logs every App render. `node verify.mjs` directly counts those browser logs during that route transition and exits 0 when more than 20 renders occur.
