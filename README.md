# Next.js issue 46657 reproduction

This minimal Pages Router app returns a JavaScript `Date` from `getServerSideProps`. Run `node verify.mjs`; exit code 0 means the request failed with Next.js's Date serialization error, exit code 1 means that symptom was absent, and any other code means the check itself failed.
