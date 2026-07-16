# Next.js issue 63210 reproduction

This app isolates the reporter's static `generateStaticParams` route with a Partial Prerendering hole. The verifier emulates the affected Vercel resume invocation that selected `/blog/[slug]` instead of the concrete `/blog/known` streaming route, then checks for the reported resumable-slot tree mismatch.
