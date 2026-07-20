# Next.js issue 65736 reproduction

This Pages Router app configures the documented custom cache handler and invokes `response.revalidate('/')` from `/api/revalidate`. The verifier confirms that on-demand page regeneration reaches the handler's `get` and `set` methods but never its `revalidateTag` method.

Run `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means `revalidateTag` was called; any other code means verification failed.
