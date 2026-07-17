# Next.js issue 76957 reproduction

This app directly observes the client Router Cache behavior described by the documentation report. Route B explicitly prefetches dynamic route A and the control proves navigation uses that cached payload without another RSC request. A Server Action then calls `revalidateTag` for a tag unused by either route; the check reports the issue when route A must be fetched again.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported broad Router Cache invalidation is present; exit 1 means it is absent.
