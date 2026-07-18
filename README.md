# Next.js issue 63479 reproduction

Builds a route from `generateStaticParams()` with `dynamicParams = false`, invokes `revalidatePath('/', 'layout')` through the page's server action, and checks whether the generated route incorrectly changes from HTTP 200 to HTTP 404.

Run `npm install` and then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
