# Issue 83612 reproduction

This minimal app enables experimental inline CSS, builds with Turbopack, and applies a Google font. The verification builds and starts the production server, extracts the generated font URL from the inline CSS, and requests it. Exit 0 means the generated URL returns 404 (the reported bug); exit 1 means the font is served successfully.
