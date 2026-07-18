# Next.js issue 80430 reproduction

This app returns a generated video sitemap whose title contains a literal ampersand. Run `node verify.mjs`; exit 0 means the served `/sitemap/1.xml` is malformed because the ampersand was not XML-escaped, exit 1 means the XML is valid, and any other exit code means verification failed.
