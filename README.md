# Next.js issue 75783 reproduction

This Pages Router app uses Ant Design with server-side CSS extraction. Run `node verify.mjs`; exit 0 means `next build` reproduced the reported `rc-util/es/utils/get` module-resolution failure, exit 1 means the build passed, and any other exit code means the check itself failed.
