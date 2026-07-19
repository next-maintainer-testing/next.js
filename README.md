# Next.js issue 70020 reproduction

This minimal Pages Router app uses Yarn Plug'n'Play, installs `sass-embedded` without `sass`, selects it through `sassOptions.implementation`, and imports a global SCSS file. Run `yarn install` and `node verify.mjs`.
