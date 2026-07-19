# Next.js issue 62740 reproduction

This static App Router export builds two deployments of the same route. The verifier requests the generated `/article.txt?_rsc=acgkz` resource from each deployment and reports the bug when the identical cache URL serves different RSC payload bytes across deployments.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means absent.
