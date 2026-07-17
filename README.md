# Issue 81732 reproduction

This minimal App Router project invokes a Server Action from a protected page. Middleware intercepts the action request and redirects it to `/login`, reproducing the reported case where the action is blocked but the browser does not navigate to the login page.

Run `npm install` and `node verify.mjs`.
