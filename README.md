# Next.js issue 81591 reproduction

This minimal app renders `GoogleMapsEmbed` in `directions` mode with both required endpoints. The verifier renders the component and reports the bug when the generated iframe URL omits `origin` or `destination`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
