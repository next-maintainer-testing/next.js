# Issue 76322 reproduction

This standalone App Router page streams invalid nested-button markup inside Suspense, then checks in headless Chromium whether the final visible DOM contains two copies of `This will get rendered twice` instead of one.

Run `npm install` and `node verify.mjs`. Exit code 0 means the duplicate-DOM symptom is present; exit code 1 means it is absent.
