# Next.js issue 53734 reproduction

This Pages Router app requests `/my-path/test?param=123` and renders the value of `useRouter().query.param`. The verification succeeds only when the dynamic segment (`test`) overwrites the URL query parameter (`123`), which is the reported symptom.

Run `npm install`, then `node verify.mjs`.
