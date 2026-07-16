# Next.js issue 48759 reproduction

This app reproduces the missing camel-case alias for a dashed CSS Module class. The verification starts the app and checks the rendered response: the ordinary CSS Module class is emitted, while `styles.largeDescription` leaves the target element without a class.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.
