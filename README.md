# Client `redirect()` caught by an error boundary

Minimal reproduction for vercel/next.js#62458. It renders a component that calls Next.js `redirect()` inside a React error boundary and verifies that the boundary catches the redirect exception and renders its fallback. The issue did not state a package version, so this pins Next.js 14.1.0, the latest stable release when the issue was filed, with React 18.2.0.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.
