# Next.js issue 53987 reproduction

This Pages Router app throws an intentional server-only error inside a React Suspense boundary. The server should render the fallback and the browser should retry the component, without Next.js showing its development error popup.

Run `npm install`, `npm run dev`, and open the printed local URL. `node verify.mjs` checks the reported popup symptom automatically.
