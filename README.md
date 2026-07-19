# React alias reproduction

Minimal reproduction for vercel/next.js#59092. The webpack hook aliases `react` and `react-dom` to their installed package directories; requesting the App Router page checks whether that supported-looking alias causes a server error.
