# Next.js issue 80254 reproduction

`app/(public)/about/page.tsx` does not call `useSearchParams`, but a shared footer rendered by its route-group layout does so without a Suspense boundary. On the reported Next.js version, `next build` fails with the missing-Suspense diagnostic attributed to `/about`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent; any other code means the check failed.
