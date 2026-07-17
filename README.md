# Next.js issue 80852 reproduction

This hybrid Pages/App Router application uses `basePath: "/app"`. From the Pages Router home page, the button calls `router.push("/cars/11841")`. The App Router has a dynamic route below the same `/cars` prefix, which makes the client router filter choose a hard navigation. The reported bug adds the base path a second time, navigating to `/app/app/cars/11841` instead of `/app/cars/11841`.

Run `node verify.mjs`. Exit 0 means the duplicated-base-path symptom occurred; exit 1 means navigation used the expected path; any other exit code means verification failed.
