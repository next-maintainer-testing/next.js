# Next.js issue 59744 reproduction

`app/page.tsx` imports `app/message.ts` using the ESM-compatible `./message.js` specifier. Run `node verify.mjs`: exit 0 means `next build` exhibits the reported module-not-found error; exit 1 means the build resolves the import.
