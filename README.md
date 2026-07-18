# Next.js issue 58805 reproduction

This minimal Pages Router app imports `components/Foo.tsx` through the fully specified specifier `../components/Foo.js` while TypeScript uses `module: "esnext"` and `moduleResolution: "bundler"`.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported module-resolution failure occurred; exit 1 means the build succeeded; any other exit code means verification failed.
