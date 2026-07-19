# Next.js issue 73507 reproduction

This app renders normal, directly memoized, and indirectly memoized client components from one server component. The check loads the page, invokes `router.refresh()`, and compares each component's browser-observed mount identity before and after the refreshed server payload arrives.

Run `npm install` and then `node verify.mjs`. Exit 0 means only the directly rendered `React.memo` component remounted (the reported symptom); exit 1 means no component remounted; any other exit indicates an invalid check run.
