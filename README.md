# Next.js issue #64252 reproduction

This minimal App Router page returns `other: { 'fb:app_id': 'FB_APP_ID' }` from `generateMetadata`.

Run `node verify.mjs`. Exit 0 means the generated HTML incorrectly uses `name="fb:app_id"`; exit 1 means it uses the expected `property="fb:app_id"`; any other exit code means verification failed.
