# `next/image` blur-placeholder timing reproduction

This minimal App Router page renders a transparent SVG with `next/image` and `placeholder="blur"`. The verifier delays hydration JavaScript and checks the precise reported state: the final image is fully loaded while the server-rendered blur background remains visible underneath it. It then releases JavaScript and confirms hydration removes the placeholder, distinguishing the timing bug from an unrelated load failure.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other exit code means verification failed.
