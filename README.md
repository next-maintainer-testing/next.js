# Issue 83760 reproduction

This minimal Next.js 15.5.3 app uses the array-based PostCSS plugin configuration generated for Tailwind and Storybook 9.1.5 with `@storybook/nextjs-vite`. Run `node verify.mjs`; exit code 0 means Storybook emitted the reported `SB_FRAMEWORK_NEXTJS_0003` incompatibility error.
