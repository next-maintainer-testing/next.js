# Next.js issue 79496 reproduction

This minimal App Router project passes a parallel-route `breadcrumbs` slot through a client React context and renders it in a descendant client component. On Next.js 15.3.2, requesting `/` returns HTTP 500 with `Cannot read properties of undefined (reading '0')` in `OuterLayoutRouter` instead of rendering the breadcrumb and page content.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
